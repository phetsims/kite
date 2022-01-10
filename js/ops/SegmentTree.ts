// Copyright 2022, University of Colorado Boulder

/**
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import arrayRemove from '../../../phet-core/js/arrayRemove.js';
import cleanArray from '../../../phet-core/js/cleanArray.js';
import Poolable from '../../../phet-core/js/Poolable.js';
import Range from '../../../dot/js/Range.js';
import kite from '../kite.js';
import Edge from './Edge.js';

let globalId = 1;
const scratchArray: Edge[] = [];

class SegmentTree {

  rootNode: SegmentNode;
  private readonly epsilon: number;
  private readonly edges: Set<Edge>;

  constructor( epsilon = 1e-6 ) {
    // @ts-ignore -- TODO: Poolable support
    this.rootNode = SegmentNode.createFromPool( Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY );
    this.rootNode.isBlack = true;

    this.epsilon = epsilon;

    this.edges = new Set<Edge>();
  }

  query( edge: Edge, interruptableCallback: ( edge: Edge ) => boolean ) {
    const id = globalId++;

    if ( this.rootNode ) {
      const range = SegmentTree.getEdgeRange( edge, this.epsilon );

      this.rootNode.query( edge, range.min, range.max, id, interruptableCallback );
    }
  }

  addEdge( edge: Edge ) {
    const range = SegmentTree.getEdgeRange( edge, this.epsilon );

    // TOOD: consider adding into one traversal
    this.rootNode.split( range.min, this );
    this.rootNode.split( range.max, this );
    this.rootNode.addEdge( edge, range.min, range.max );

    this.edges.add( edge );
  }

  removeEdge( edge: Edge ) {
    const range = SegmentTree.getEdgeRange( edge, this.epsilon );
    this.rootNode.removeEdge( edge, range.min, range.max );
    this.edges.delete( edge );
  }

  audit() {
    this.rootNode.audit( this.epsilon, this.edges, [] );
  }

  toString() {
    let spacing = 0;
    let string = '';

    ( function recurse( node: SegmentNode ) {
      string += `${_.repeat( '  ', spacing )}${node.toString()}\n`;
      spacing++;
      if ( node.hasChildren() ) {
        recurse( node.left! );
        recurse( node.right! );
      }
      spacing--;
    } )( this.rootNode );

    return string;
  }

  static getEdgeRange( edge: Edge, epsilon: number ): Range {
    assert && assert( edge.segment !== null );

    // @ts-ignore -- TODO: Get Segment typed correctly
    const bounds = edge.segment!.bounds;

    assert && assert( bounds.isFinite() );

    const left = bounds.left - epsilon;
    const right = bounds.right + epsilon;

    return new Range( left, right );
  }
}

class SegmentNode {

  min!: number;
  max!: number;
  left!: SegmentNode | null;
  right!: SegmentNode | null;
  parent!: SegmentNode | null;
  splitValue!: number | null;
  edges: Edge[];
  isBlack!: boolean;

  constructor( min: number, max: number ) {
    this.edges = [];

    this.initialize( min, max );
  }

  initialize( min: number, max: number ): this {
    this.min = min;
    this.max = max;

    this.splitValue = null;
    this.left = null;
    this.right = null;
    this.parent = null;

    this.isBlack = false;

    cleanArray( this.edges );

    return this;
  }

  contains( n: number ) {
    return n >= this.min && n <= this.max;
  }

  hasChildren() { return this.splitValue !== null; }

  query( edge: Edge, min: number, max: number, id: number, interruptableCallback: ( edge: Edge ) => boolean ): boolean {
    let abort = false;

    // Partial containment works for everything checking for possible overlap
    if ( this.min <= max && this.max >= min ) {

      // Do an interruptable iteration
      for ( let i = 0; i < this.edges.length; i++ ) {
        const edge = this.edges[ i ];
        if ( !edge.internalData || edge.internalData < id ) {
          edge.internalData = id;
          abort = interruptableCallback( edge );
          if ( abort ) {
            return true;
          }
        }
      }

      if ( this.hasChildren() ) {
        if ( !abort ) {
          abort = this.left!.query( edge, min, max, id, interruptableCallback );
        }

        if ( !abort ) {
          abort = this.right!.query( edge, min, max, id, interruptableCallback );
        }
      }
    }

    return abort;
  }

  swapChild( oldChild: SegmentNode, newChild: SegmentNode ) {
    assert && assert( this.left === oldChild || this.right === oldChild );

    if ( this.left === oldChild ) {
      this.left = newChild;
    }
    else {
      this.right = newChild;
    }
  }

  hasChild( node: SegmentNode ) {
    return this.left === node || this.right === node;
  }

  otherChild( node: SegmentNode ): SegmentNode {
    assert && assert( this.hasChild( node ) );

    return ( ( this.left === node ) ? this.right : this.left )!;
  }

  leftRotate( tree: SegmentTree ) {
    assert && assert( this.hasChildren() && this.right!.hasChildren() );

    if ( this.right!.hasChildren() ) {
      const y = this.right!;
      const alpha = this.left!;
      const beta = y.left!;
      const gamma = y.right!;

      y.parent = this.parent;
      if ( this.parent ) {
        this.parent.swapChild( this, y );
      }
      else {
        tree.rootNode = y;
      }
      this.parent = y;
      beta.parent = this;

      y.left = this;
      this.left = alpha;
      this.right = beta;

      this.max = beta.max;
      this.splitValue = alpha.max;
      y.min = this.min;
      y.splitValue = this.max;

      const xEdges: Edge[] = cleanArray( scratchArray );
      xEdges.push( ...this.edges );
      cleanArray( this.edges );

      // combine alpha-beta into x
      for ( let i = alpha.edges.length - 1; i >= 0; i-- ) {
        const edge = alpha.edges[ i ];
        const index = beta.edges.indexOf( edge );
        if ( index >= 0 ) {
          alpha.edges.splice( i, 1 );
          beta.edges.splice( index, 1 );
          this.edges.push( edge );
        }
      }

      // push y to beta and gamma
      beta.edges.push( ...y.edges );
      gamma.edges.push( ...y.edges );
      cleanArray( y.edges );

      // x edges to y
      y.edges.push( ...xEdges );
    }
  }

  rightRotate( tree: SegmentTree ) {
    assert && assert( this.hasChildren() && this.left!.hasChildren() );

    const x = this.left!;
    const gamma = this.right!;
    const alpha = x.left!;
    const beta = x.right!;

    x.parent = this.parent;
    if ( this.parent ) {
      this.parent.swapChild( this, x );
    }
    else {
      tree.rootNode = x;
    }
    this.parent = x;
    beta.parent = this;

    x.right = this;
    this.left = beta;
    this.right = gamma;

    this.min = beta.min;
    this.splitValue = gamma.min;
    x.max = this.max;
    x.splitValue = this.min;

    const yEdges: Edge[] = cleanArray( scratchArray );
    yEdges.push( ...this.edges );
    cleanArray( this.edges );

    // combine beta-gamma into y
    for ( let i = gamma.edges.length - 1; i >= 0; i-- ) {
      const edge = gamma.edges[ i ];
      const index = beta.edges.indexOf( edge );
      if ( index >= 0 ) {
        gamma.edges.splice( i, 1 );
        beta.edges.splice( index, 1 );
        this.edges.push( edge );
      }
    }

    // push x to alpha and beta
    alpha.edges.push( ...x.edges );
    beta.edges.push( ...x.edges );
    cleanArray( x.edges );

    // y edges to x
    x.edges.push( ...yEdges );
  }

  fixRedBlack( tree: SegmentTree ) {
    assert && assert( !this.isBlack );

    if ( !this.parent ) {
      this.isBlack = true;
    }
    else {
      const parent = this.parent;

      if ( !parent.isBlack ) {
        // Due to red-black nature, grandparent should exist since if parent was the root, it would be black.
        const grandparent = parent.parent!;
        const uncle = grandparent.otherChild( parent );

        if ( !uncle.isBlack ) {
          // case 1
          parent.isBlack = true;
          uncle.isBlack = true;
          grandparent.isBlack = false;
          grandparent.fixRedBlack( tree );
        }
        else {
          if ( parent === grandparent.left ) {
            if ( this === parent.right ) {
              // case 2
              parent.leftRotate( tree );
              parent.parent!.isBlack = true;
              parent.parent!.parent!.isBlack = false;
              parent.parent!.parent!.rightRotate( tree );
            }
            else {
              // case 3
              parent.isBlack = true;
              grandparent.isBlack = false;
              grandparent.rightRotate( tree );
            }
          }
          else {
            if ( this === parent.left ) {
              // case 2
              parent.rightRotate( tree );
              parent.parent!.isBlack = true;
              parent.parent!.parent!.isBlack = false;
              parent.parent!.parent!.leftRotate( tree );
            }
            else {
              // case 3
              parent.isBlack = true;
              grandparent.isBlack = false;
              grandparent.leftRotate( tree );
            }
          }
        }
      }
    }
  }

  split( n: number, tree: SegmentTree ) {
    assert && assert( this.contains( n ) );

    // Ignore splits if we are already split on them
    if ( n === this.min || n === this.max ) {
      return;
    }

    if ( this.hasChildren() ) {
      // If our split value is the same as our current one, we've already split on that
      if ( this.splitValue !== n ) {
        ( n > this.splitValue! ? this.right : this.left )!.split( n, tree );
      }
    }
    else {
      this.splitValue = n;

      // @ts-ignore -- TODO: Poolable support
      const newLeft = SegmentNode.createFromPool( this.min, n );
      newLeft.parent = this;
      this.left = newLeft;

      // @ts-ignore -- TODO: Poolable support
      const newRight = SegmentNode.createFromPool( n, this.max );
      newRight.parent = this;
      this.right = newRight;

      // Check if we need to do red-black tree balancing
      if ( !this.isBlack && this.parent ) {
        const parent = this.parent;
        const sibling = parent.otherChild( this )!;
        if ( sibling.isBlack ) {
          if ( this === parent.left ) {
            parent.rightRotate( tree );
            newLeft.isBlack = true;
          }
          else {
            parent.leftRotate( tree );
            newRight.isBlack = true;
          }
          this.fixRedBlack( tree );
        }
        else {
          this.isBlack = true;
          sibling.isBlack = true;
          parent.isBlack = false;

          parent.fixRedBlack( tree );
        }
      }
    }
  }

  addEdge( edge: Edge, min: number, max: number ) {
    // Ignore no-overlap cases
    if ( this.min > max || this.max < min ) {
      return;
    }

    if ( this.min >= min && this.max <= max ) {
      // We are fully contained
      this.edges.push( edge );
    }
    else if ( this.hasChildren() ) {
      this.left!.addEdge( edge, min, max );
      this.right!.addEdge( edge, min, max );
    }
  }

  removeEdge( edge: Edge, min: number, max: number ) {
    // Ignore no-overlap cases
    if ( this.min > max || this.max < min ) {
      return;
    }

    if ( this.min >= min && this.max <= max ) {
      // We are fully contained
      assert && assert( this.edges.includes( edge ) );
      arrayRemove( this.edges, edge );
    }
    else if ( this.hasChildren() ) {
      this.left!.removeEdge( edge, min, max );
      this.right!.removeEdge( edge, min, max );
    }
  }

  audit( epsilon: number, allEdges: Set<Edge>, presentEdges: Edge[] = [] ) {
    if ( assert ) {
      for ( const edge of presentEdges ) {
        assert( !this.edges.includes( edge ) );
      }
      for ( const edge of this.edges ) {
        // Containment check, this node should be fully contained
        const range = SegmentTree.getEdgeRange( edge, epsilon );
        assert( range.min <= this.min );
        assert( range.max >= this.max );
      }
      for ( const edge of presentEdges ) {
        const range = SegmentTree.getEdgeRange( edge, epsilon );
        if ( range.min <= this.min && range.max >= this.max ) {
          assert( allEdges.has( edge ) || this.edges.includes( edge ) );
        }
      }

      assert( this.hasChildren() === ( this.left !== null ) );
      assert( this.hasChildren() === ( this.right !== null ) );
      assert( this.hasChildren() === ( this.splitValue !== null ) );
      assert( this.min < this.max );

      if ( this.parent ) {
        assert( this.parent.hasChild( this ) );
        assert( this.isBlack || this.parent.isBlack );
      }
      if ( this.hasChildren() ) {
        assert( this.left!.parent === this );
        assert( this.right!.parent === this );
        assert( this.min === this.left!.min );
        assert( this.max === this.right!.max );
        assert( this.splitValue === this.left!.max );
        assert( this.splitValue === this.right!.min );

        for ( const edge of this.left!.edges ) {
          assert( !this.right!.edges.includes( edge ), 'We shouldn\'t have two children with the same edge' );
        }

        const childPresentEdges = [ ...presentEdges, ...this.edges ];
        this.left!.audit( epsilon, allEdges, childPresentEdges );
        this.right!.audit( epsilon, allEdges, childPresentEdges );
      }
    }
  }

  toString() {
    // @ts-ignore
    return `[${this.min} ${this.max}] split:${this.splitValue} ${this.isBlack ? 'black' : 'red'} ${this.edges.map( edge => `[${edge.segment.bounds.minX},${edge.segment.bounds.maxX}]` )}`;
  }
}
Poolable.mixInto( SegmentNode );

kite.register( 'SegmentTree', SegmentTree );

export default SegmentTree;
