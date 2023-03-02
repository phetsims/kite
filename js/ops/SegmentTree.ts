// Copyright 2022-2023, University of Colorado Boulder

/**
 * An accelerated data structure of items where it supports fast queries of "what items overlap wth x values",
 * so we don't have to iterate through all items.
 *
 * This effectively combines an interval/segment tree with red-black tree balancing for insertion.
 *
 * For proper red-black constraints, we handle ranges from -infinity to infinity.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import arrayRemove from '../../../phet-core/js/arrayRemove.js';
import cleanArray from '../../../phet-core/js/cleanArray.js';
import Pool from '../../../phet-core/js/Pool.js';
import { Edge, kite } from '../imports.js';

let globalId = 1;
const scratchArray: Edge[] = [];

type SegmentInfo<T> = {
  getMinX: ( item: T, epsilon: number ) => number;
  getMaxX: ( item: T, epsilon: number ) => number;
};

export default abstract class SegmentTree<T> implements SegmentInfo<T> {

  public rootNode: SegmentNode<T>;

  // Our epsilon, used to expand the bounds of segments so we have some non-zero amount of "overlap" for our segments
  private readonly epsilon: number;

  // All items currently in the tree
  private readonly items: Set<T>;

  /**
   * @param epsilon - Used to expand the bounds of segments so we have some non-zero amount of "overlap" for our
   *                  segments
   */
  public constructor( epsilon = 1e-6 ) {
    this.rootNode = SegmentNode.pool.create( this, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY ) as SegmentNode<T>;
    this.rootNode.isBlack = true;

    this.epsilon = epsilon;

    this.items = new Set<T>();
  }

  public abstract getMinX( item: T, epsilon: number ): number;
  public abstract getMaxX( item: T, epsilon: number ): number;

  /**
   * Calls interruptableCallback in turn for every "possibly overlapping" item stored in this tree.
   *
   * @param item - The item to use for the bounds range.
   * @param interruptableCallback - When this returns true, the search will be aborted
   */
  public query( item: T, interruptableCallback: ( item: T ) => boolean ): boolean {
    const id = globalId++;

    if ( this.rootNode ) {
      return this.rootNode.query( item, this.getMinX( item, this.epsilon ), this.getMaxX( item, this.epsilon ), id, interruptableCallback );
    }
    else {
      return false;
    }
  }

  public addItem( item: T ): void {
    const min = this.getMinX( item, this.epsilon );
    const max = this.getMaxX( item, this.epsilon );

    // TOOD: consider adding into one traversal
    this.rootNode.split( min, this );
    this.rootNode.split( max, this );
    this.rootNode.addItem( item, min, max );

    this.items.add( item );
  }

  public removeItem( item: T ): void {
    this.rootNode.removeItem( item, this.getMinX( item, this.epsilon ), this.getMaxX( item, this.epsilon ) );
    this.items.delete( item );
  }

  /**
   * For assertion purposes
   */
  public audit(): void {
    this.rootNode.audit( this.epsilon, this.items, [] );
  }

  public toString(): string {
    let spacing = 0;
    let string = '';

    ( function recurse( node: SegmentNode<T> ) {
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
}

// The nodes in our tree
class SegmentNode<T> {

  // The minimum x value of this subtree
  public min!: number;

  // The maximum x value of this subtree
  public max!: number;

  // Child nodes (not specified if we have no children or splitValue). Left value is defined as the smaller range.
  public left!: SegmentNode<T> | null;
  public right!: SegmentNode<T> | null;

  // Parent node (root will have null)
  public parent!: SegmentNode<T> | null;

  // The value where we split our interval into our children (so if we are 0-10, and a split value of 5, our left child
  // will have 0-5 and our right child will have 5-10.
  public splitValue!: number | null;

  // All items that cover this full range of our min-max. These will be stored as high up in the tree as possible.
  public items: T[];

  // Red-black tree color information, for self-balancing
  public isBlack!: boolean;

  public tree!: SegmentTree<T>;

  public constructor( tree: SegmentTree<T>, min: number, max: number ) {
    this.items = [];

    this.initialize( tree, min, max );
  }

  public initialize( tree: SegmentTree<T>, min: number, max: number ): this {
    this.min = min;
    this.max = max;

    this.splitValue = null;
    this.left = null;
    this.right = null;
    this.parent = null;
    this.tree = tree;

    this.isBlack = false;

    cleanArray( this.items );

    return this;
  }

  public contains( n: number ): boolean {
    return n >= this.min && n <= this.max;
  }

  public hasChildren(): boolean { return this.splitValue !== null; }

  /**
   * Iterates through interruptableCallback for every potentially overlapping edge - aborts when it returns true
   *
   * @param item
   * @param min - computed min for the item
   * @param max - computed max for the item
   * @param id - our 1-time id that we use to not repeat calls with the same item
   * @param interruptableCallback
   * @returns whether we were aborted
   */
  public query( item: T, min: number, max: number, id: number, interruptableCallback: ( item: T ) => boolean ): boolean {
    let abort = false;

    // Partial containment works for everything checking for possible overlap
    if ( this.min <= max && this.max >= min ) {

      // Do an interruptable iteration
      for ( let i = 0; i < this.items.length; i++ ) {
        const item = this.items[ i ];
        // @ts-expect-error
        if ( !item.internalData.segmentId || item.internalData.segmentId < id ) {
          // @ts-expect-error
          item.internalData.segmentId = id;
          abort = interruptableCallback( item );
          if ( abort ) {
            return true;
          }
        }
      }

      if ( this.hasChildren() ) {
        if ( !abort ) {
          abort = this.left!.query( item, min, max, id, interruptableCallback );
        }

        if ( !abort ) {
          abort = this.right!.query( item, min, max, id, interruptableCallback );
        }
      }
    }

    return abort;
  }

  /**
   * Replaces one child with another
   */
  public swapChild( oldChild: SegmentNode<T>, newChild: SegmentNode<T> ): void {
    assert && assert( this.left === oldChild || this.right === oldChild );

    if ( this.left === oldChild ) {
      this.left = newChild;
    }
    else {
      this.right = newChild;
    }
  }

  public hasChild( node: SegmentNode<T> ): boolean {
    return this.left === node || this.right === node;
  }

  public otherChild( node: SegmentNode<T> ): SegmentNode<T> {
    assert && assert( this.hasChild( node ) );

    return ( ( this.left === node ) ? this.right : this.left )!;
  }

  /**
   * Tree operation needed for red-black self-balancing
   */
  public leftRotate( tree: SegmentTree<T> ): void {
    assert && assert( this.hasChildren() && this.right!.hasChildren() );

    if ( this.right!.hasChildren() ) {
      const y = this.right!;
      const alpha = this.left!;
      const beta = y.left!;
      const gamma = y.right!;

      // Recreate parent/child connections
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

      // Recompute min/max/splitValue
      this.max = beta.max;
      this.splitValue = alpha.max;
      y.min = this.min;
      y.splitValue = this.max;

      // Start recomputation of stored items
      const xEdges: T[] = cleanArray( scratchArray );
      xEdges.push( ...this.items );
      cleanArray( this.items );

      // combine alpha-beta into x
      for ( let i = alpha.items.length - 1; i >= 0; i-- ) {
        const edge = alpha.items[ i ];
        const index = beta.items.indexOf( edge );
        if ( index >= 0 ) {
          alpha.items.splice( i, 1 );
          beta.items.splice( index, 1 );
          this.items.push( edge );
        }
      }

      // push y to beta and gamma
      beta.items.push( ...y.items );
      gamma.items.push( ...y.items );
      cleanArray( y.items );

      // x items to y
      y.items.push( ...xEdges );
    }
  }

  /**
   * Tree operation needed for red-black self-balancing
   */
  public rightRotate( tree: SegmentTree<T> ): void {
    assert && assert( this.hasChildren() && this.left!.hasChildren() );

    const x = this.left!;
    const gamma = this.right!;
    const alpha = x.left!;
    const beta = x.right!;

    // Recreate parent/child connections
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

    // Recompute min/max/splitValue
    this.min = beta.min;
    this.splitValue = gamma.min;
    x.max = this.max;
    x.splitValue = this.min;

    // Start recomputation of stored items
    const yEdges: T[] = cleanArray( scratchArray );
    yEdges.push( ...this.items );
    cleanArray( this.items );

    // combine beta-gamma into y
    for ( let i = gamma.items.length - 1; i >= 0; i-- ) {
      const edge = gamma.items[ i ];
      const index = beta.items.indexOf( edge );
      if ( index >= 0 ) {
        gamma.items.splice( i, 1 );
        beta.items.splice( index, 1 );
        this.items.push( edge );
      }
    }

    // push x to alpha and beta
    alpha.items.push( ...x.items );
    beta.items.push( ...x.items );
    cleanArray( x.items );

    // y items to x
    x.items.push( ...yEdges );
  }

  /**
   * Called after an insertion (or potentially deletion in the future) that handles red-black tree rebalancing.
   */
  public fixRedBlack( tree: SegmentTree<T> ): void {
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

  /**
   * Triggers a split of whatever interval contains this value (or is a no-op if we already split at it before).
   */
  public split( n: number, tree: SegmentTree<T> ): void {
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

      const newLeft = SegmentNode.pool.create( this.tree, this.min, n ) as SegmentNode<T>;
      newLeft.parent = this;
      this.left = newLeft;

      const newRight = SegmentNode.pool.create( this.tree, n, this.max ) as SegmentNode<T>;
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
          // case 1
          this.isBlack = true;
          sibling.isBlack = true;
          parent.isBlack = false;

          parent.fixRedBlack( tree );
        }
      }
    }
  }

  /**
   * Recursively adds an item
   */
  public addItem( item: T, min: number, max: number ): void {
    // Ignore no-overlap cases
    if ( this.min > max || this.max < min ) {
      return;
    }

    if ( this.min >= min && this.max <= max ) {
      // We are fully contained
      this.items.push( item );
    }
    else if ( this.hasChildren() ) {
      this.left!.addItem( item, min, max );
      this.right!.addItem( item, min, max );
    }
  }

  /**
   * Recursively removes an item
   */
  public removeItem( item: T, min: number, max: number ): void {
    // Ignore no-overlap cases
    if ( this.min > max || this.max < min ) {
      return;
    }

    if ( this.min >= min && this.max <= max ) {
      // We are fully contained
      assert && assert( this.items.includes( item ) );
      arrayRemove( this.items, item );
    }
    else if ( this.hasChildren() ) {
      this.left!.removeItem( item, min, max );
      this.right!.removeItem( item, min, max );
    }
  }

  /**
   * Recursively audits with assertions, checking all of our assumptions.
   *
   * @param epsilon
   * @param allItems - All items in the tree
   * @param presentItems - Edges that were present in ancestors
   */
  public audit( epsilon: number, allItems: Set<T>, presentItems: T[] = [] ): void {
    if ( assert ) {
      for ( const item of presentItems ) {
        assert( !this.items.includes( item ) );
      }
      for ( const item of this.items ) {
        // Containment check, this node should be fully contained
        assert( this.tree.getMinX( item, epsilon ) <= this.min );
        assert( this.tree.getMaxX( item, epsilon ) >= this.max );
      }
      for ( const item of presentItems ) {
        if ( this.tree.getMinX( item, epsilon ) <= this.min && this.tree.getMaxX( item, epsilon ) >= this.max ) {
          assert( allItems.has( item ) || this.items.includes( item ) );
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

        for ( const item of this.left!.items ) {
          assert( !this.right!.items.includes( item ), 'We shouldn\'t have two children with the same item' );
        }

        const childPresentItems = [ ...presentItems, ...this.items ];
        this.left!.audit( epsilon, allItems, childPresentItems );
        this.right!.audit( epsilon, allItems, childPresentItems );
      }
    }
  }

  public toString(): string {
    return `[${this.min} ${this.max}] split:${this.splitValue} ${this.isBlack ? 'black' : 'red'} ${this.items}`;
  }

  public freeToPool(): void {
    SegmentNode.pool.freeToPool( this );
  }

  public static readonly pool = new Pool( SegmentNode );

}
kite.register( 'SegmentTree', SegmentTree );
