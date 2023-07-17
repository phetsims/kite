// Copyright 2023, University of Colorado Boulder

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

import Matrix3 from '../../../dot/js/Matrix3.js';
import Vector2 from '../../../dot/js/Vector2.js';
import { kite } from '../imports.js';
import Complex from '../../../dot/js/Complex.js';

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

  // TODO: less garbage creation
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

    // TODO: epsilon evaluation?
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
    return { degenerateConicMatrices: [], points: [], lines: [] };
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
    lines: _.flatten( lineCollections )
  };
};
export default intersectConicMatrices;

kite.register( 'intersectConicMatrices', intersectConicMatrices );
