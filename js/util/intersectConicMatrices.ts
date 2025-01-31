// Copyright 2023-2025, University of Colorado Boulder

/**
 * Handles intersections of conic sections (based on their matrix representations).
 *
 * Modelled off of https://math.stackexchange.com/questions/425366/finding-intersection-of-an-ellipse-with-another-ellipse-when-both-are-rotated/425412#425412
 *
 * Should be in the form specified by https://en.wikipedia.org/wiki/Matrix_representation_of_conic_sections, i.e. given
 *
 * Q(x,y) = Ax^2 + Bxy + Cy^2 + Dx + Ey + F = 0
 *
 * The matrix should be in the form:
 *
 * [ A, B/2, D/2 ]
 * [ B/2, C, E/2 ]
 * [ D/2, E/2, F ]
 *
 * In this file, we often handle matrices of complex values. They are typically 3x3 and stored in row-major order, thus:
 *
 * [ A, B, C ]
 * [ D, E, F ]
 * [ G, H, I ]
 *
 * will be stored as [ A, B, C, D, E, F, G, H, I ].
 *
 * If something is noted as a "line", it is a homogeneous-coordinate form in complex numbers, e.g. an array
 * [ a, b, c ] represents the line ax + by + c = 0.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Complex from '../../../dot/js/Complex.js';
import Matrix from '../../../dot/js/Matrix.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import Ray2 from '../../../dot/js/Ray2.js';
import { SingularValueDecomposition } from '../../../dot/js/Matrix.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Vector4 from '../../../dot/js/Vector4.js';
import kite from '../kite.js';

// Determinant of a 2x2 matrix
const getDet2 = ( a: Complex, b: Complex, c: Complex, d: Complex ) => {
  return a.times( d ).minus( b.times( c ) );
};

const getDeterminant = ( matrix: Complex[] ): Complex => {
  const m00 = matrix[ 0 ];
  const m01 = matrix[ 1 ];
  const m02 = matrix[ 2 ];
  const m10 = matrix[ 3 ];
  const m11 = matrix[ 4 ];
  const m12 = matrix[ 5 ];
  const m20 = matrix[ 6 ];
  const m21 = matrix[ 7 ];
  const m22 = matrix[ 8 ];

  return ( m00.times( m11 ).times( m22 ) ).plus( m01.times( m12 ).times( m20 ) ).plus( m02.times( m10 ).times( m21 ) ).minus( m02.times( m11 ).times( m20 ) ).minus( m01.times( m10 ).times( m22 ) ).minus( m00.times( m12 ).times( m21 ) );
};

// Adjugate of a 3x3 matrix in row-major order
const getAdjugateMatrix = ( matrix: Complex[] ): Complex[] => {
  const m11 = matrix[ 0 ];
  const m12 = matrix[ 1 ];
  const m13 = matrix[ 2 ];
  const m21 = matrix[ 3 ];
  const m22 = matrix[ 4 ];
  const m23 = matrix[ 5 ];
  const m31 = matrix[ 6 ];
  const m32 = matrix[ 7 ];
  const m33 = matrix[ 8 ];

  return [
    getDet2( m22, m23, m32, m33 ),
    getDet2( m12, m13, m32, m33 ).negate(),
    getDet2( m12, m13, m22, m23 ),
    getDet2( m21, m23, m31, m33 ).negate(),
    getDet2( m11, m13, m31, m33 ),
    getDet2( m11, m13, m21, m23 ).negate(),
    getDet2( m21, m22, m31, m32 ),
    getDet2( m11, m12, m31, m32 ).negate(),
    getDet2( m11, m12, m21, m22 )
  ];
};

// NOTE: Do we need to invert the imaginary parts here? Complex transpose...?
const getTranspose = ( matrix: Complex[] ): Complex[] => {
  return [
    matrix[ 0 ], matrix[ 3 ], matrix[ 6 ],
    matrix[ 1 ], matrix[ 4 ], matrix[ 7 ],
    matrix[ 2 ], matrix[ 5 ], matrix[ 8 ]
  ];
};

// If checkLast=false, we won't provide rows that have a zero in the first two entries
const getNonzeroRow = ( matrix: Complex[], checkLast = false ): Complex[] => {
  return _.sortBy( [ matrix.slice( 0, 3 ), matrix.slice( 3, 6 ), matrix.slice( 6, 9 ) ], row => {
    return -( row[ 0 ].magnitude + row[ 1 ].magnitude + ( checkLast ? row[ 2 ].magnitude : 0 ) );
  } )[ 0 ];
};

// If checkLast=false, we won't provide columns that have a zero in the first two entries
const getNonzeroColumn = ( matrix: Complex[], checkLast = false ): Complex[] => {
  return getNonzeroRow( getTranspose( matrix ), checkLast );
};

const getAntiSymmetricMatrix = ( matrix: Complex[] ) => {
  const adjugate = getAdjugateMatrix( matrix );
  const nonzeroRow = getNonzeroRow( adjugate );
  return [
    Complex.ZERO, nonzeroRow[ 2 ], nonzeroRow[ 1 ].negated(),
    nonzeroRow[ 2 ].negated(), Complex.ZERO, nonzeroRow[ 0 ],
    nonzeroRow[ 1 ], nonzeroRow[ 0 ].negated(), Complex.ZERO
  ];
};

const computeAlpha = ( degenerateConicMatrix: Complex[], antiSymmetricMatrix: Complex[] ): Complex | null => {
  // Can use an arbitrary 2x2 minor to compute, since we want:
  // rank( degenerateConicMatrix + alpha * antiSymmetricMatrix ) = 1

  // ( d00 + alpha * a00 ) * q = ( d01 + alpha * a01 )
  // ( d10 + alpha * a10 ) * q = ( d11 + alpha * a11 )
  // ( d01 + alpha * a01 ) / ( d00 + alpha * a00 ) = ( d11 + alpha * a11 ) / ( d10 + alpha * a10 )
  // ( d01 + alpha * a01 ) * ( d10 + alpha * a10 ) - ( d00 + alpha * a00 ) * ( d11 + alpha * a11 ) = 0
  // ( a01 * a10 - a00 * a11 ) alpha^2 + d01 * d10 - d00 * d11 + alpha (-a11 * d00 + a10 * d01 + a01 * d10 - a00 * d11 )
  // ( a01 * a10 - a00 * a11 ) alpha^2 + (-a11 * d00 + a10 * d01 + a01 * d10 - a00 * d11 ) alpha + (d01 * d10 - d00 * d11)
  const d00 = degenerateConicMatrix[ 0 ];
  const d01 = degenerateConicMatrix[ 1 ];
  const d10 = degenerateConicMatrix[ 3 ];
  const d11 = degenerateConicMatrix[ 4 ];
  const a00 = antiSymmetricMatrix[ 0 ];
  const a01 = antiSymmetricMatrix[ 1 ];
  const a10 = antiSymmetricMatrix[ 3 ];
  const a11 = antiSymmetricMatrix[ 4 ];

  // TODO: less garbage creation https://github.com/phetsims/kite/issues/97
  const A = a01.times( a10 ).minus( a00.times( a11 ) );
  const B = a11.negated().times( d00 ).plus( a10.times( d01 ) ).plus( a01.times( d10 ) ).minus( a00.times( d11 ) );
  const C = d01.times( d10 ).minus( d00.times( d11 ) );

  const roots = Complex.solveQuadraticRoots( A, B, C );

  // If there are roots, pick the first one
  return roots === null ? null : roots[ 0 ];
};

const getRank1DegenerateConicMatrix = ( matrix: Complex[] ) => {
  const antiSymmetricMatrix = getAntiSymmetricMatrix( matrix );
  const alpha = computeAlpha( matrix, antiSymmetricMatrix );
  if ( alpha === null ) {
    // already in proper form, adding the antiSymmetricMatrix in any linear combination will still be rank 1
    return matrix;
  }
  else {
    return [
      matrix[ 0 ].plus( alpha.times( antiSymmetricMatrix[ 0 ] ) ),
      matrix[ 1 ].plus( alpha.times( antiSymmetricMatrix[ 1 ] ) ),
      matrix[ 2 ].plus( alpha.times( antiSymmetricMatrix[ 2 ] ) ),
      matrix[ 3 ].plus( alpha.times( antiSymmetricMatrix[ 3 ] ) ),
      matrix[ 4 ].plus( alpha.times( antiSymmetricMatrix[ 4 ] ) ),
      matrix[ 5 ].plus( alpha.times( antiSymmetricMatrix[ 5 ] ) ),
      matrix[ 6 ].plus( alpha.times( antiSymmetricMatrix[ 6 ] ) ),
      matrix[ 7 ].plus( alpha.times( antiSymmetricMatrix[ 7 ] ) ),
      matrix[ 8 ].plus( alpha.times( antiSymmetricMatrix[ 8 ] ) )
    ];
  }
};

/**
 * A degenerate conic is essentially a product of two lines, e.g. (Px + Qy + C)(Sx + Ty + U) = 0 (where everything is
 * complex valued in this case). Each line is topologically equivalent to a plane.
 */
const getRealIntersectionsForDegenerateConic = ( matrix: Complex[] ): ( Vector2 | Ray2 )[] => {
  // TODO: check whether we are symmetric. https://github.com/phetsims/kite/issues/97
  const result: ( Vector2 | Ray2 )[] = [];

  type ComplexXY = [ Complex, Complex ];

  // Ax^2 + Bxy + Cy^2 + Dx + Ey + F = 0 (complex valued)
  const A = matrix[ 0 ];
  const B = matrix[ 1 ].times( Complex.real( 2 ) );
  const C = matrix[ 4 ];
  const D = matrix[ 2 ].times( Complex.real( 2 ) );
  const E = matrix[ 5 ].times( Complex.real( 2 ) );
  const F = matrix[ 8 ];

  // const ev = ( x: Complex, y: Complex ) => {
  //   return A.times( x ).times( x )
  //     .plus( B.times( x ).times( y ) )
  //     .plus( C.times( y ).times( y ) )
  //     .plus( D.times( x ) )
  //     .plus( E.times( y ) )
  //     .plus( F );
  // };

  // We'll now find (ideally) two solutions for the conic, such that they are each on one of the lines
  let solutions: ComplexXY[] = [];
  const alpha = new Complex( -2.51653525696959, 1.52928502844020 ); // randomly chosen
  // first try picking an x and solve for multiple y (x=alpha)
  // (C)y^2 + (B*alpha + E)y + (A*alpha^2 + D*alpha + F) = 0
  const xAlphaA = C;
  const xAlphaB = B.times( alpha ).plus( E );
  const xAlphaC = A.times( alpha ).times( alpha ).plus( D.times( alpha ) ).plus( F );
  const xAlphaRoots = Complex.solveQuadraticRoots( xAlphaA, xAlphaB, xAlphaC );
  if ( xAlphaRoots && xAlphaRoots.length >= 2 ) {
    solutions = [
      [ alpha, xAlphaRoots[ 0 ] ],
      [ alpha, xAlphaRoots[ 1 ] ]
    ];
  }
  else {
    // Now try y=alpha
    // (A)x^2 + (B*alpha + D)x + (C*alpha^2 + E*alpha + F) = 0
    const yAlphaA = A;
    const yAlphaB = B.times( alpha ).plus( D );
    const yAlphaC = C.times( alpha ).times( alpha ).plus( E.times( alpha ) ).plus( F );
    const yAlphaRoots = Complex.solveQuadraticRoots( yAlphaA, yAlphaB, yAlphaC );
    if ( yAlphaRoots && yAlphaRoots.length >= 2 ) {
      solutions = [
        [ yAlphaRoots[ 0 ], alpha ],
        [ yAlphaRoots[ 1 ], alpha ]
      ];
    }
    else {
      // Select only one root if we have it, we might have a double line
      if ( xAlphaRoots && xAlphaRoots.length === 1 ) {
        solutions = [
          [ alpha, xAlphaRoots[ 0 ] ]
        ];
      }
      else if ( yAlphaRoots && yAlphaRoots.length === 1 ) {
        solutions = [
          [ yAlphaRoots[ 0 ], alpha ]
        ];
      }
      else {
        throw new Error( 'Implement more advanced initialization to find two solutions' );
      }
    }
  }

  solutions.forEach( ( solution: ComplexXY ) => {
    // Here, we'll be breaking out the complex x,y into quads of: [ realX, realY, imaginaryX, imaginaryY ] denoted as
    // [ rx, ry, ix, iy ].

    /**
     * Broken case:
      A
      Complex {real: -2.3062816034702394e-7, imaginary: -0.000050001623100918746}
      B
      Complex {real: 0, imaginary: 0}
      C
      Complex {real: -2.3062816034702394e-7, imaginary: -0.000050001623100918746}
      D
      Complex {real: -0.009907748735827226, imaginary: 0.0200006492403675}
      E
      Complex {real: 0.00009225126416367857, imaginary: 0.0200006492403675}
      F
      Complex {real: 1.9838810287765227, imaginary: -3.5001136170643123}


     real: 200.0025, 100   and 200.0025, 300    are better solutions, but obviously could be refined
     */

    const rx = solution[ 0 ].real;
    const ry = solution[ 1 ].real;
    const ix = solution[ 0 ].imaginary;
    const iy = solution[ 1 ].imaginary;
    const rA = A.real;
    const rB = B.real;
    const rC = C.real;
    const rD = D.real;
    const rE = E.real;
    const iA = A.imaginary;
    const iB = B.imaginary;
    const iC = C.imaginary;
    const iD = D.imaginary;
    const iE = E.imaginary;

    type ExpandedRealXY = Vector4; // rx, ry, ix, iy

    const realGradient: ExpandedRealXY = new Vector4(
      -2 * iA * ix - iB * iy + rD + 2 * rA * rx + rB * ry,
      -iB * ix - 2 * iC * iy + rE + rB * rx + 2 * rC * ry,
      -iD - 2 * ix * rA - iy * rB - 2 * iA * rx - iB * ry,
      -iE - ix * rB - 2 * iy * rC - iB * rx - 2 * iC * ry
    );

    // [ number, number, number, number ]
    const imaginaryGradient: ExpandedRealXY = new Vector4(
      iD + 2 * ix * rA + iy * rB + 2 * iA * rx + iB * ry,
      iE + ix * rB + 2 * iy * rC + iB * rx + 2 * iC * ry,
      -2 * iA * ix - iB * iy + rD + 2 * rA * rx + rB * ry,
      -iB * ix - 2 * iC * iy + rE + rB * rx + 2 * rC * ry
    );

    const randomPointA: ExpandedRealXY = new Vector4(
      6.1951068548253,
      -1.1592689503860,
      0.1602918829294,
      3.205818692048202
    );

    const randomPointB: ExpandedRealXY = new Vector4(
      -5.420628549296924,
      -15.2069583028685,
      0.1595906020488680,
      5.10688288040682
    );

    const proj = ( v: ExpandedRealXY, u: ExpandedRealXY ) => {
      return u.timesScalar( v.dot( u ) / u.dot( u ) );
    };

    // Gram-Schmidt orthogonalization to get a nice basis
    const basisRealGradient = realGradient;
    const basisImaginaryGradient = imaginaryGradient
      .minus( proj( imaginaryGradient, basisRealGradient ) );
    const basisPlane0 = randomPointA
      .minus( proj( randomPointA, basisRealGradient ) )
      .minus( proj( randomPointA, basisImaginaryGradient ) );
    const basisPlane1 = randomPointB
      .minus( proj( randomPointB, basisRealGradient ) )
      .minus( proj( randomPointB, basisImaginaryGradient ) )
      .minus( proj( randomPointB, basisPlane0 ) );

    // Our basis in the exclusively-imaginary plane
    const basisMatrix = new Matrix( 2, 2, [
      basisPlane0.z, basisPlane1.z,
      basisPlane0.w, basisPlane1.w
    ] );
    const singularValues = new SingularValueDecomposition( basisMatrix ).getSingularValues();

    let realSolution: Vector2 | null = null;
    if ( Math.abs( ix ) < 1e-10 && Math.abs( iy ) < 1e-10 ) {

      realSolution = new Vector2( rx, ry );
    }
    else {
      // iP + t * iB0 + u * iB1 = 0, if we can find t,u where (P + t * B0 + u * B1) is real
      //
      // [ iB0x IB1x ] [ t ] = [ -iPx ]
      // [ iB0y IB1y ] [ u ]   [ -iPy ]

      if ( Math.abs( singularValues[ 1 ] ) > 1e-10 ) {
        // rank 2
        const tu = basisMatrix.solve( new Matrix( 2, 1, [ -ix, -iy ] ) ).extractVector2( 0 );
        realSolution = new Vector2(
          rx + tu.x * basisPlane0.z + tu.y * basisPlane1.z,
          ry + tu.x * basisPlane0.w + tu.y * basisPlane1.w
        );
      }
      else if ( Math.abs( singularValues[ 0 ] ) > 1e-10 ) {
        // rank 1 - columns are multiples of each other, one possibly (0,0)

        // For imaginary bases (we'll use them potentially multiple times if we have a rank 1 matrix
        const largestBasis = Math.abs( basisPlane0.z ) + Math.abs( basisPlane0.w ) > Math.abs( basisPlane1.z ) + Math.abs( basisPlane1.w ) ? basisPlane0 : basisPlane1;
        const largestBasisImaginaryVector = new Vector2( largestBasis.z, largestBasis.w );

        const t = new Vector2( ix, iy ).dot( largestBasisImaginaryVector ) / largestBasisImaginaryVector.dot( largestBasisImaginaryVector );
        const potentialSolution = new Vector4( rx, ry, ix, iy ).minus( largestBasis.timesScalar( t ) );
        if ( Math.abs( potentialSolution.z ) < 1e-8 && Math.abs( potentialSolution.w ) < 1e-8 ) {
          realSolution = new Vector2( potentialSolution.x, potentialSolution.y );
        }
      }
      else {
        // rank 0 AND our solution is NOT real, then there is no solution
        realSolution = null;
      }

      if ( realSolution ) {
        // We need to check if we have a line of solutions now!
        if ( Math.abs( singularValues[ 1 ] ) > 1e-10 ) {
          // rank 2
          // Our solution is the only solution (no linear combination of basis vectors besides our current solution
          // that would be real)
          result.push( realSolution );
        }
        else if ( Math.abs( singularValues[ 0 ] ) > 1e-10 ) {
          // rank 1
          // Our bases are a multiple of each other. We need to find a linear combination of them that is real, then
          // every multiple of that will be a solution (line). If either is (0,0), we will use that one, so check that
          // first
          // TODO: can we deduplicate this with code above? https://github.com/phetsims/kite/issues/97
          const zeroLarger = Math.abs( basisPlane0.z ) + Math.abs( basisPlane0.w ) > Math.abs( basisPlane1.z ) + Math.abs( basisPlane1.w );
          const smallestBasis = zeroLarger ? basisPlane1 : basisPlane0;
          const largestBasis = zeroLarger ? basisPlane0 : basisPlane1;

          // Find the largest component, so if we have a zero x or y in both our bases, it will work out fine
          const xLarger = Math.abs( largestBasis.z ) > Math.abs( largestBasis.w );

          // largestBasis * t = smallestBasis, supports smallestBasis=(0,0)
          const t = xLarger ? ( smallestBasis.z / largestBasis.z ) : ( smallestBasis.w / largestBasis.w );

          const direction4 = largestBasis.timesScalar( t ).minus( smallestBasis );

          // Should be unconditionally a non-zero direction, otherwise they wouldn't be basis vectors
          result.push( new Ray2( realSolution, new Vector2( direction4.x, direction4.y ).normalized() ) );
        }
        else {
          // rank 0
          // THEY ARE ALL SOLUTIONS, we're on the real plane. That isn't useful to us, so we don't add any results
        }
      }
    }
  } );

  return result;
};

const getLinesForDegenerateConic = ( matrix: Complex[] ): Complex[][] => {
  const rank1DegenerateConicMatrix = getRank1DegenerateConicMatrix( matrix );
  return [
    getNonzeroRow( rank1DegenerateConicMatrix ),
    getNonzeroColumn( rank1DegenerateConicMatrix )
  ];
};

const lineIntersect = ( line1: Complex[], line2: Complex[] ): Vector2 | null => {
  // line1: a1 * x + b1 * y + c1 = 0
  // line2: a2 * x + b2 * y + c2 = 0
  // y = ( -a1 * x - c1 ) / b1
  // y = ( -a2 * x - c2 ) / b2
  // ( -a1 * x - c1 ) / b1 = ( -a2 * x - c2 ) / b2
  // ( -a1 * x - c1 ) * b2 = ( -a2 * x - c2 ) * b1

  // x = ( b2 * c1 - b1 * c2 ) / ( a2 * b1 - a1 * b2 );

  const a1 = line1[ 0 ];
  const b1 = line1[ 1 ];
  const c1 = line1[ 2 ];
  const a2 = line2[ 0 ];
  const b2 = line2[ 1 ];
  const c2 = line2[ 2 ];

  const determinant = a2.times( b1 ).minus( a1.times( b2 ) );
  if ( determinant.equalsEpsilon( Complex.ZERO, 1e-8 ) ) {
    return null;
  }
  else {
    const x = b2.times( c1 ).minus( b1.times( c2 ) ).dividedBy( determinant );

    let y;
    if ( !b1.equalsEpsilon( Complex.ZERO, 1e-8 ) ) {
      y = a1.negated().times( x ).minus( c1 ).dividedBy( b1 ); // Use our first line
    }
    else if ( !b2.equalsEpsilon( Complex.ZERO, 1e-8 ) ) {
      y = a2.negated().times( x ).minus( c2 ).dividedBy( b2 ); // Use our second line
    }
    else {
      return null;
    }

    // TODO: epsilon evaluation? https://github.com/phetsims/kite/issues/97
    if ( Math.abs( x.imaginary ) < 1e-8 && Math.abs( y.imaginary ) < 1e-8 ) {
      return new Vector2( x.real, y.real );
    }
    else {
      return null;
    }
  }
};

type ConicMatrixIntersections = {
  points: Vector2[];
  degenerateConicMatrices: Complex[][];
  lines: Complex[][];
  intersectionCollections: ( Vector2 | Ray2 )[][];
};

// NOTE: Assumes these matrices are NOT degenerate (will only be tested for circles/ellipses)
const intersectConicMatrices = ( a: Matrix3, b: Matrix3 ): ConicMatrixIntersections => {
  // Modeled off of

  // compute C = lambda * A + B, where lambda is chosen so that det(C) = 0
  // NOTE: This assumes we don't have degenerate conic matrices

  // det(C) = c00 * c11 * c22 + c01 * c12 * c20 + c02 * c10 * c21 - c02 * c11 * c20 - c01 * c10 * c22 - c00 * c12 * c21
  // c00 = a00 * lambda + b00
  // c01 = a01 * lambda + b01
  // c02 = a02 * lambda + b02
  // c10 = a10 * lambda + b10
  // c11 = a11 * lambda + b11
  // c12 = a12 * lambda + b12
  // c20 = a20 * lambda + b20
  // c21 = a21 * lambda + b21
  // c22 = a22 * lambda + b22

  // A lambda^3 + B lambda^2 + C lambda + D = 0

  const a00 = a.m00();
  const a01 = a.m01();
  const a02 = a.m02();
  const a10 = a.m10();
  const a11 = a.m11();
  const a12 = a.m12();
  const a20 = a.m20();
  const a21 = a.m21();
  const a22 = a.m22();
  const b00 = b.m00();
  const b01 = b.m01();
  const b02 = b.m02();
  const b10 = b.m10();
  const b11 = b.m11();
  const b12 = b.m12();
  const b20 = b.m20();
  const b21 = b.m21();
  const b22 = b.m22();

  const A = -a02 * a11 * a20 + a01 * a12 * a20 + a02 * a10 * a21 - a00 * a12 * a21 - a01 * a10 * a22 + a00 * a11 * a22;
  const B = -a10 * a22 * b01 + a10 * a21 * b02 + a02 * a21 * b10 - a01 * a22 * b10 - a02 * a20 * b11 + a00 * a22 * b11 + a01 * a20 * b12 - a00 * a21 * b12 + a02 * a10 * b21 + a12 * ( -a21 * b00 + a20 * b01 + a01 * b20 - a00 * b21 ) - a01 * a10 * b22 + a11 * ( a22 * b00 - a20 * b02 - a02 * b20 + a00 * b22 );
  const C = -a22 * b01 * b10 + a21 * b02 * b10 + a22 * b00 * b11 - a20 * b02 * b11 - a21 * b00 * b12 + a20 * b01 * b12 + a12 * b01 * b20 - a11 * b02 * b20 - a02 * b11 * b20 + a01 * b12 * b20 - a12 * b00 * b21 + a10 * b02 * b21 + a02 * b10 * b21 - a00 * b12 * b21 + a11 * b00 * b22 - a10 * b01 * b22 - a01 * b10 * b22 + a00 * b11 * b22;
  const D = -b02 * b11 * b20 + b01 * b12 * b20 + b02 * b10 * b21 - b00 * b12 * b21 - b01 * b10 * b22 + b00 * b11 * b22;

  // NOTE: we don't have a discriminant threshold right now
  const potentialLambdas = Complex.solveCubicRoots( Complex.real( A ), Complex.real( B ), Complex.real( C ), Complex.real( D ) );

  if ( !potentialLambdas || potentialLambdas.length === 0 ) {
    // Probably overlapping, infinite intersections
    return { degenerateConicMatrices: [], intersectionCollections: [], points: [], lines: [] };
  }

  const uniqueLambdas = _.uniqWith( potentialLambdas, ( a, b ) => a.equals( b ) );

  const degenerateConicMatrices = uniqueLambdas.map( lambda => {
    return [
      Complex.real( a00 ).multiply( lambda ).add( Complex.real( b00 ) ),
      Complex.real( a01 ).multiply( lambda ).add( Complex.real( b01 ) ),
      Complex.real( a02 ).multiply( lambda ).add( Complex.real( b02 ) ),
      Complex.real( a10 ).multiply( lambda ).add( Complex.real( b10 ) ),
      Complex.real( a11 ).multiply( lambda ).add( Complex.real( b11 ) ),
      Complex.real( a12 ).multiply( lambda ).add( Complex.real( b12 ) ),
      Complex.real( a20 ).multiply( lambda ).add( Complex.real( b20 ) ),
      Complex.real( a21 ).multiply( lambda ).add( Complex.real( b21 ) ),
      Complex.real( a22 ).multiply( lambda ).add( Complex.real( b22 ) )
    ];
  } );

  console.log( 'determinant magnitudes', degenerateConicMatrices.map( m => getDeterminant( m ).magnitude ) );

  const result: Vector2[] = [];
  const lineCollections = degenerateConicMatrices.map( getLinesForDegenerateConic );
  console.log( lineCollections );

  const intersectionCollections = degenerateConicMatrices.map( getRealIntersectionsForDegenerateConic );
  console.log( intersectionCollections );

  for ( let i = 0; i < lineCollections.length; i++ ) {
    const lines0 = lineCollections[ i ];

    // We need to handle a case where two conics are touching at a tangent point
    const selfIntersection = lineIntersect( lines0[ 0 ], lines0[ 1 ] );
    if ( selfIntersection ) {
      result.push( selfIntersection );
    }

    for ( let j = i + 1; j < lineCollections.length; j++ ) {
      const lines1 = lineCollections[ j ];

      const candidates = [
        lineIntersect( lines0[ 0 ], lines1[ 0 ] ),
        lineIntersect( lines0[ 0 ], lines1[ 1 ] ),
        lineIntersect( lines0[ 1 ], lines1[ 0 ] ),
        lineIntersect( lines0[ 1 ], lines1[ 1 ] )
      ];

      for ( let k = 0; k < 4; k++ ) {
        const candidate = candidates[ k ];
        if ( candidate ) {
          result.push( candidate );
        }
      }
    }
  }

  return {
    points: result,
    degenerateConicMatrices: degenerateConicMatrices,
    lines: _.flatten( lineCollections ),
    intersectionCollections: intersectionCollections
  };
};
export default intersectConicMatrices;

kite.register( 'intersectConicMatrices', intersectConicMatrices );