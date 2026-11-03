/**
 * @fileoverview Canonical unit system and 2D geometric primitives
 * for the base document platform.
 *
 * ── UNIT SYSTEM ─────────────────────────────────────────────────────────────
 * The canonical internal unit is the typographic POINT (1/72 of an inch).
 * All dimensional values within Layer 1 (Document Model) and Layer 2 (Layout
 * Engine) are expressed exclusively in Points.
 *
 * Conversion to device pixels occurs ONLY at the Layer 2 → Layer 3 boundary
 * (Rendering Core), through the explicit conversion utilities at the bottom of
 * this module. Layer 1 and Layer 2 code must never reference Pixels,
 * PixelPoint, PixelSize, PixelRect, or PixelInsets — those types are defined
 * here because this module owns the conversion contract, not because lower
 * layers use them.
 *
 * ── BRANDED TYPES ───────────────────────────────────────────────────────────
 * Points, Pixels, Twips, and EMU are opaque branded number types. TypeScript
 * arithmetic on branded numbers produces plain `number` (the brand is lost).
 * Use the arithmetic helpers (addPt, subPt, …) to preserve the brand through
 * calculations, and the constructor functions (pt, px, twips, emu) as the only
 * sanctioned way to introduce a raw number into a typed unit domain.
 *
 * ── IMMUTABILITY ────────────────────────────────────────────────────────────
 * All geometric interfaces (Point, Size, Rect, Insets) declare readonly fields.
 * Every operation returns a new value; none mutates its inputs.
 *
 * ── COORDINATE CONVENTION ───────────────────────────────────────────────────
 * • Origin (0, 0) is the top-left corner of the page content area.
 * • The y-axis increases downward (consistent with CSS/DOM coordinates).
 * • The x-axis increases rightward.
 * • Document-global y coordinates accumulate across page breaks so that a
 *   single absolute y value uniquely identifies a vertical position in the
 *   whole document, not just on a given page. The Layout Engine tracks both
 *   document-global y and page-local y; LayoutResult exposes both.
 */

// ─────────────────────────────────────────────────────────────────────────────
// § 1  Branded numeric types
// ─────────────────────────────────────────────────────────────────────────────
//
// The `declare const … unique symbol` pattern creates a compile-time-only brand
// token. `declare` emits nothing at runtime; the symbol is used exclusively as
// a computed property key inside a type expression. The resulting intersection
// is unspoofable without an explicit cast, enforcing unit discipline across
// the entire codebase at zero runtime cost. A `Points` value IS a `number` at
// runtime — the brand adds no bytes and no overhead.
//
// ESLint note: the _-prefixed names are intentionally "declared but not used as
// values." Configure @typescript-eslint/no-unused-vars with varsIgnorePattern
// matching /^_/ or suppress the rule for this block.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const _ptsBrand: unique symbol;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const _pxBrand: unique symbol;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const _twipsBrand: unique symbol;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const _emuBrand: unique symbol;

/**
 * Typographic points (1/72 of an inch). The canonical layout unit for all
 * of Layer 1 and Layer 2.
 *
 * Never cast a raw `number` to `Points` directly — use pt(). Direct casts
 * outside this module's constructor and arithmetic helpers are architectural
 * violations and should be flagged in code review.
 */
export type Points = number & { readonly [_ptsBrand]: void };

/**
 * CSS logical pixels (1/96 of an inch at standard browser zoom). Exists only
 * at the Layer 2 → Layer 3 render boundary and above. Layer 1 and Layer 2
 * code must not reference this type.
 *
 * Both toCSSPixels() and toPhysicalPixels() return Pixels. The distinction is
 * semantic and is tracked by which conversion function the Rendering Core
 * calls, not by separate types.
 */
export type Pixels = number & { readonly [_pxBrand]: void };

/**
 * Twips (1/1440 of an inch = 1/20 of a point). Used in OOXML (.docx) for
 * certain measurements. Convert to Points immediately on import via
 * twipsToPt(); do not store Twips in the document model.
 */
export type Twips = number & { readonly [_twipsBrand]: void };

/**
 * English Metric Units (1/914400 of an inch = 1/12700 of a point). The
 * primary spatial unit inside OOXML for most drawing and image dimensions.
 * Convert to Points immediately on import via emuToPt(); do not store EMU
 * in the document model.
 */
export type EMU = number & { readonly [_emuBrand]: void };

// ─────────────────────────────────────────────────────────────────────────────
// § 2  Unit constants
// ─────────────────────────────────────────────────────────────────────────────

/** The definition of the typographic point: exactly 72 points per inch. */
export const POINTS_PER_INCH = 72 as const;

/**
 * Standard CSS screen DPI. One CSS pixel = 1/96 of an inch at 100% browser
 * zoom. Supply this as the `dpi` argument to makeResolutionContext() for
 * all screen rendering targets.
 */
export const SCREEN_DPI = 96 as const;

/**
 * Print DPI aligned to point resolution: 1 pt maps to exactly 1 CSS "pixel"
 * at this DPI, before the print engine applies its own output scaling.
 */
export const PRINT_DPI = 72 as const;

/** Twips per point (exact: 20 twips = 1 pt). */
export const TWIPS_PER_POINT = 20 as const;

/** Twips per inch (exact: 1440 twips = 1 in). */
export const TWIPS_PER_INCH = 1440 as const;

/** EMUs per point (exact: 12700 EMU = 1 pt). */
export const EMU_PER_POINT = 12700 as const;

/** EMUs per inch (exact: 914400 EMU = 1 in). */
export const EMU_PER_INCH = 914400 as const;

/**
 * Floating-point comparison threshold for Points values in layout-critical
 * contexts. At 72 pt/in, 0.001 pt ≈ 0.0035 mm — below any perceptible
 * measurement or print-fidelity requirement.
 *
 * Used by ptEq() and by the Layout Engine's propagation short-circuit: if a
 * re-laid-out chunk ends at the same vertical position as before (within this
 * epsilon), layout propagation stops instead of cascading through the document.
 */
export const PT_EPSILON: Points = 0.001 as Points;

/** The zero value in the Points domain. */
export const ZERO_PT: Points = 0 as Points;

/** The zero value in the Pixels domain. */
export const ZERO_PX: Pixels = 0 as Pixels;

// ─────────────────────────────────────────────────────────────────────────────
// § 3  Branded value constructors
// ─────────────────────────────────────────────────────────────────────────────
//
// These are the ONLY sanctioned sites in the codebase where a raw `number`
// should enter a branded unit domain. All other occurrences of `as Points`
// (or the other brands) outside arithmetic helpers in this module are
// suspect and must be justified in code review.

/**
 * Lift a raw number into the Points domain.
 * Use for literal constants, user-supplied values, and deserialized document
 * data where the source is authoritatively in typographic points.
 */
export function pt(value: number): Points {
  return value as Points;
}

/**
 * Lift a raw number into the Pixels domain.
 * Should appear only in Layer 3 (rendering-core) and Layer 4 (apps).
 */
export function px(value: number): Pixels {
  return value as Pixels;
}

/**
 * Lift a raw number into the Twips domain (for OOXML import only).
 * Immediately convert the result with twipsToPt(); do not persist Twips.
 */
export function twips(value: number): Twips {
  return value as Twips;
}

/**
 * Lift a raw number into the EMU domain (for OOXML import only).
 * Immediately convert the result with emuToPt(); do not persist EMU.
 */
export function emu(value: number): EMU {
  return value as EMU;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  External unit → Points conversion
// ─────────────────────────────────────────────────────────────────────────────

/** Convert inches to Points (1 in = 72 pt, exact). */
export function inchesToPt(inches: number): Points {
  return (inches * POINTS_PER_INCH) as Points;
}

/** Convert Points to inches. */
export function ptToInches(value: Points): number {
  return value / POINTS_PER_INCH;
}

/** Convert millimetres to Points (1 mm = 72 / 25.4 pt ≈ 2.8346 pt). */
export function mmToPt(mm: number): Points {
  return ((mm * POINTS_PER_INCH) / 25.4) as Points;
}

/** Convert Points to millimetres. */
export function ptToMm(value: Points): number {
  return (value / POINTS_PER_INCH) * 25.4;
}

/** Convert centimetres to Points (1 cm = 720 / 25.4 pt ≈ 28.346 pt). */
export function cmToPt(cm: number): Points {
  return ((cm * POINTS_PER_INCH) / 2.54) as Points;
}

/** Convert Points to centimetres. */
export function ptToCm(value: Points): number {
  return (value / POINTS_PER_INCH) * 2.54;
}

/** Convert Twips to Points (20 twips = 1 pt, exact). */
export function twipsToPt(value: Twips): Points {
  return (value / TWIPS_PER_POINT) as Points;
}

/** Convert Points to Twips (1 pt = 20 twips, exact). */
export function ptToTwips(value: Points): Twips {
  return (value * TWIPS_PER_POINT) as Twips;
}

/** Convert EMUs to Points (12700 EMU = 1 pt, exact). */
export function emuToPt(value: EMU): Points {
  return (value / EMU_PER_POINT) as Points;
}

/** Convert Points to EMUs (1 pt = 12700 EMU, exact). */
export function ptToEmu(value: Points): EMU {
  return (value * EMU_PER_POINT) as EMU;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  Points arithmetic
// ─────────────────────────────────────────────────────────────────────────────
//
// TypeScript arithmetic on `Points` operands yields plain `number` because the
// branded intersection is erased in arithmetic expressions. These helpers
// re-brand the result so the unit remains explicit at every call site.
//
// Multiplication and division are only defined for Points × scalar (or ÷ scalar)
// — dimensionless operations that preserve the Points unit. Dividing Points by
// Points yields a dimensionless ratio; write that as `(a / b)` with no brand.

export function addPt(a: Points, b: Points): Points {
  return (a + b) as Points;
}

export function subPt(a: Points, b: Points): Points {
  return (a - b) as Points;
}

/** Multiply a Points value by a dimensionless scalar. */
export function mulPt(a: Points, scalar: number): Points {
  return (a * scalar) as Points;
}

/**
 * Divide a Points value by a dimensionless divisor.
 * Caller is responsible for ensuring divisor ≠ 0; passing 0 produces Infinity,
 * which will surface as a layout anomaly rather than a thrown error.
 */
export function divPt(a: Points, divisor: number): Points {
  return (a / divisor) as Points;
}

export function negPt(a: Points): Points {
  return (-a) as Points;
}

export function absPt(a: Points): Points {
  return Math.abs(a) as Points;
}

export function minPt(a: Points, b: Points): Points {
  return (a < b ? a : b) as Points;
}

export function maxPt(a: Points, b: Points): Points {
  return (a > b ? a : b) as Points;
}

export function clampPt(value: Points, lo: Points, hi: Points): Points {
  return (value < lo ? lo : value > hi ? hi : value) as Points;
}

/** Round to the nearest integer point. */
export function roundPt(a: Points): Points {
  return Math.round(a) as Points;
}

/** Floor toward −∞ to the nearest integer point. */
export function floorPt(a: Points): Points {
  return Math.floor(a) as Points;
}

/** Ceil toward +∞ to the nearest integer point. */
export function ceilPt(a: Points): Points {
  return Math.ceil(a) as Points;
}

/**
 * Test whether two Points values are equal within a tolerance.
 *
 * Always prefer this over strict `===` for layout-critical comparisons.
 * The Layout Engine's propagation short-circuit relies on this: if a
 * re-laid-out chunk ends at the same y coordinate as the previous layout
 * (within PT_EPSILON), propagation stops rather than cascading through the
 * rest of the document.
 */
export function ptEq(
  a: Points,
  b: Points,
  epsilon: Points = PT_EPSILON,
): boolean {
  return Math.abs(a - b) <= epsilon;
}

/** True if |a| ≤ epsilon (effectively zero in the layout coordinate space). */
export function ptIsZero(a: Points, epsilon: Points = PT_EPSILON): boolean {
  return Math.abs(a) <= epsilon;
}

/** True if a > epsilon (strictly positive beyond floating-point noise). */
export function ptIsPositive(a: Points, epsilon: Points = PT_EPSILON): boolean {
  return a > epsilon;
}

/** True if a < −epsilon (strictly negative beyond floating-point noise). */
export function ptIsNegative(a: Points, epsilon: Points = PT_EPSILON): boolean {
  return a < -epsilon;
}

/**
 * Sign of a Points value with an epsilon dead-band around zero.
 * Returns −1, 0, or 1. Used by the Layout Engine to determine propagation
 * direction without branching on exact zero.
 */
export function ptSign(a: Points, epsilon: Points = PT_EPSILON): -1 | 0 | 1 {
  if (a > epsilon) return 1;
  if (a < -epsilon) return -1;
  return 0;
}

/**
 * Linear interpolation: a + t * (b − a).
 * t = 0 → a, t = 1 → b. t is unclamped; values outside [0, 1] extrapolate.
 */
export function lerpPt(a: Points, b: Points, t: number): Points {
  return (a + (b - a) * t) as Points;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6  Geometric interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A 2D position in the document coordinate space, expressed in Points.
 * All fields are readonly; use factory functions to produce instances.
 */
export interface Point {
  readonly x: Points;
  readonly y: Points;
}

/**
 * A 2D extent with non-negative dimensions, expressed in Points.
 * Callers are responsible for ensuring width ≥ 0 and height ≥ 0.
 * Use ZERO_SIZE for a degenerate (collapsed) size.
 */
export interface Size {
  readonly width: Points;
  readonly height: Points;
}

/**
 * An axis-aligned rectangle in the document coordinate space, expressed in
 * Points. (x, y) is the top-left corner; width and height must be ≥ 0.
 *
 * Use the accessor functions (rectRight, rectBottom, rectCenter, …) rather
 * than re-deriving edges inline — this confines arithmetic errors to one place
 * and makes intent visible at call sites.
 */
export interface Rect {
  readonly x: Points;
  readonly y: Points;
  readonly width: Points;
  readonly height: Points;
}

/**
 * Directional insets (padding or margin) expressed in Points.
 * Positive values shrink a rect inward; negative values expand it outward.
 * Argument/field order follows CSS shorthand: top, right, bottom, left.
 */
export interface Insets {
  readonly top: Points;
  readonly right: Points;
  readonly bottom: Points;
  readonly left: Points;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7  Geometric constants
// ─────────────────────────────────────────────────────────────────────────────

/** The document origin: position (0, 0). */
export const ZERO_POINT: Readonly<Point> = Object.freeze<Point>({
  x: ZERO_PT,
  y: ZERO_PT,
});

/** A degenerate (collapsed) size: 0 × 0 pt. */
export const ZERO_SIZE: Readonly<Size> = Object.freeze<Size>({
  width: ZERO_PT,
  height: ZERO_PT,
});

/** A degenerate rect: collapsed at the origin, size 0 × 0 pt. */
export const ZERO_RECT: Readonly<Rect> = Object.freeze<Rect>({
  x: ZERO_PT,
  y: ZERO_PT,
  width: ZERO_PT,
  height: ZERO_PT,
});

/** Zero insets on all four sides. */
export const ZERO_INSETS: Readonly<Insets> = Object.freeze<Insets>({
  top: ZERO_PT,
  right: ZERO_PT,
  bottom: ZERO_PT,
  left: ZERO_PT,
});

// ─────────────────────────────────────────────────────────────────────────────
// § 8  Geometric factory functions
// ─────────────────────────────────────────────────────────────────────────────

export function makePoint(x: Points, y: Points): Point {
  return { x, y };
}

export function makeSize(width: Points, height: Points): Size {
  return { width, height };
}

export function makeRect(
  x: Points,
  y: Points,
  width: Points,
  height: Points,
): Rect {
  return { x, y, width, height };
}

/** Construct a Rect from an origin Point and a Size. */
export function makeRectFromOriginSize(origin: Point, size: Size): Rect {
  return {
    x: origin.x,
    y: origin.y,
    width: size.width,
    height: size.height,
  };
}

/**
 * Construct a Rect from two corner Points (top-left, bottom-right).
 * Caller must ensure topLeft.x ≤ bottomRight.x and topLeft.y ≤ bottomRight.y;
 * no normalisation is performed.
 */
export function makeRectFromCorners(topLeft: Point, bottomRight: Point): Rect {
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: subPt(bottomRight.x, topLeft.x),
    height: subPt(bottomRight.y, topLeft.y),
  };
}

/**
 * Construct Insets with explicit values for each side.
 * Argument order: top, right, bottom, left (matches CSS shorthand).
 */
export function makeInsets(
  top: Points,
  right: Points,
  bottom: Points,
  left: Points,
): Insets {
  return { top, right, bottom, left };
}

/** Construct Insets with the same value on all four sides. */
export function makeUniformInsets(value: Points): Insets {
  return { top: value, right: value, bottom: value, left: value };
}

/**
 * Construct Insets with separate vertical (top/bottom) and horizontal
 * (right/left) values. Mirrors the CSS two-value shorthand.
 */
export function makeAxisInsets(vertical: Points, horizontal: Points): Insets {
  return {
    top: vertical,
    right: horizontal,
    bottom: vertical,
    left: horizontal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9  Point operations
// ─────────────────────────────────────────────────────────────────────────────

export function addPoints(a: Point, b: Point): Point {
  return { x: addPt(a.x, b.x), y: addPt(a.y, b.y) };
}

export function subPoints(a: Point, b: Point): Point {
  return { x: subPt(a.x, b.x), y: subPt(a.y, b.y) };
}

/** Scale both components of a Point by a dimensionless scalar. */
export function scalePoint(p: Point, scalar: number): Point {
  return { x: mulPt(p.x, scalar), y: mulPt(p.y, scalar) };
}

/** Translate a Point by (dx, dy). */
export function offsetPoint(p: Point, dx: Points, dy: Points): Point {
  return { x: addPt(p.x, dx), y: addPt(p.y, dy) };
}

export function pointsEqual(
  a: Point,
  b: Point,
  epsilon: Points = PT_EPSILON,
): boolean {
  return ptEq(a.x, b.x, epsilon) && ptEq(a.y, b.y, epsilon);
}

/**
 * Euclidean distance between two Points, returned in Points.
 * For proximity tests where exact distance is unneeded, consider comparing
 * |dx| + |dy| (Manhattan) to avoid the square-root cost.
 */
export function pointDistance(a: Point, b: Point): Points {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy) as Points;
}

/**
 * Linear interpolation between two Points.
 * t = 0 → a, t = 1 → b. Unclamped.
 */
export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerpPt(a.x, b.x, t), y: lerpPt(a.y, b.y, t) };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 10  Size operations
// ─────────────────────────────────────────────────────────────────────────────

export function addSizes(a: Size, b: Size): Size {
  return {
    width: addPt(a.width, b.width),
    height: addPt(a.height, b.height),
  };
}

/** Scale both dimensions by a dimensionless scalar. */
export function scaleSize(s: Size, scalar: number): Size {
  return {
    width: mulPt(s.width, scalar),
    height: mulPt(s.height, scalar),
  };
}

export function sizesEqual(
  a: Size,
  b: Size,
  epsilon: Points = PT_EPSILON,
): boolean {
  return (
    ptEq(a.width, b.width, epsilon) && ptEq(a.height, b.height, epsilon)
  );
}

/**
 * Area in square points. Returns plain `number` because pt² is dimensionally
 * distinct from pt and must not be branded as Points.
 */
export function sizeArea(s: Size): number {
  return s.width * s.height;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 11  Rect accessors
// ─────────────────────────────────────────────────────────────────────────────
//
// These are the canonical derivations of edges and corners from a Rect.
// Do not inline `r.x + r.width` at call sites — use these accessors to keep
// arithmetic consistent and to make call-site intent self-documenting.

export function rectRight(r: Rect): Points {
  return addPt(r.x, r.width);
}

export function rectBottom(r: Rect): Points {
  return addPt(r.y, r.height);
}

export function rectTopLeft(r: Rect): Point {
  return { x: r.x, y: r.y };
}

export function rectTopRight(r: Rect): Point {
  return { x: rectRight(r), y: r.y };
}

export function rectBottomLeft(r: Rect): Point {
  return { x: r.x, y: rectBottom(r) };
}

export function rectBottomRight(r: Rect): Point {
  return { x: rectRight(r), y: rectBottom(r) };
}

export function rectCenter(r: Rect): Point {
  return {
    x: divPt(addPt(r.x, rectRight(r)), 2),
    y: divPt(addPt(r.y, rectBottom(r)), 2),
  };
}

/** Extract the Size component of a Rect. */
export function rectSize(r: Rect): Size {
  return { width: r.width, height: r.height };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 12  Rect predicates
// ─────────────────────────────────────────────────────────────────────────────

/** True if either dimension is ≤ 0 (degenerate or inverted). */
export function rectIsEmpty(r: Rect): boolean {
  return r.width <= 0 || r.height <= 0;
}

export function rectsEqual(
  a: Rect,
  b: Rect,
  epsilon: Points = PT_EPSILON,
): boolean {
  return (
    ptEq(a.x, b.x, epsilon) &&
    ptEq(a.y, b.y, epsilon) &&
    ptEq(a.width, b.width, epsilon) &&
    ptEq(a.height, b.height, epsilon)
  );
}

/**
 * True if point p lies strictly inside rect r, not on any boundary edge.
 *
 * This is the correct predicate for page-ownership queries: a point exactly on
 * a page's bottom edge belongs to the following page, not to both pages.
 */
export function rectContainsPoint(r: Rect, p: Point): boolean {
  return (
    p.x > r.x && p.y > r.y && p.x < rectRight(r) && p.y < rectBottom(r)
  );
}

/**
 * True if p lies inside or on the boundary of r (inclusive).
 * Use for selection and hit-testing where touching the boundary counts as a hit.
 */
export function rectContainsPointInclusive(r: Rect, p: Point): boolean {
  return (
    p.x >= r.x &&
    p.y >= r.y &&
    p.x <= rectRight(r) &&
    p.y <= rectBottom(r)
  );
}

/** True if inner is entirely contained within outer (touching is acceptable). */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

/**
 * True if rects a and b share interior area (not merely a boundary edge).
 *
 * Rects that share only an edge return false. This is the correct semantic for
 * exclusion-region queries in the Image Engine: a text line whose vertical
 * range only touches the top edge of a floating image is not excluded by it.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < rectRight(b) &&
    rectRight(a) > b.x &&
    a.y < rectBottom(b) &&
    rectBottom(a) > b.y
  );
}

/**
 * True if rects a and b share interior area or a boundary edge.
 * Use for adjacency detection (e.g., table cell border merging).
 */
export function rectsIntersectOrTouch(a: Rect, b: Rect): boolean {
  return (
    a.x <= rectRight(b) &&
    rectRight(a) >= b.x &&
    a.y <= rectBottom(b) &&
    rectBottom(a) >= b.y
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// § 13  Rect operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the intersection of two rects, or null if they share no interior
 * area. Consistent with rectsIntersect(): edge-only contact returns null,
 * preventing degenerate zero-width/zero-height rects from propagating through
 * the layout pipeline.
 */
export function rectIntersection(a: Rect, b: Rect): Rect | null {
  const x = maxPt(a.x, b.x);
  const y = maxPt(a.y, b.y);
  const right = minPt(rectRight(a), rectRight(b));
  const bottom = minPt(rectBottom(a), rectBottom(b));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: subPt(right, x), height: subPt(bottom, y) };
}

/**
 * Smallest rect that contains both a and b (bounding-box union).
 * Always returns a valid rect if either input is non-degenerate.
 */
export function rectUnion(a: Rect, b: Rect): Rect {
  const x = minPt(a.x, b.x);
  const y = minPt(a.y, b.y);
  const right = maxPt(rectRight(a), rectRight(b));
  const bottom = maxPt(rectBottom(a), rectBottom(b));
  return { x, y, width: subPt(right, x), height: subPt(bottom, y) };
}

/**
 * Smallest rect containing all rects in the array.
 * Returns null for an empty array. Degenerate input rects are included in
 * the union — filter them out beforehand if that is not desired.
 */
export function rectUnionAll(rects: ReadonlyArray<Rect>): Rect | null {
  if (rects.length === 0) return null;
  let result = rects[0];
  for (let i = 1; i < rects.length; i++) {
    result = rectUnion(result, rects[i]);
  }
  return result;
}

/**
 * Shrink a rect by directional insets (positive insets shrink inward).
 * If insets exceed the rect's dimensions the result is clamped to zero size
 * at the inset origin — width and height never go negative.
 */
export function insetRect(r: Rect, insets: Insets): Rect {
  const x = addPt(r.x, insets.left);
  const y = addPt(r.y, insets.top);
  const width = subPt(subPt(r.width, insets.left), insets.right);
  const height = subPt(subPt(r.height, insets.top), insets.bottom);
  return {
    x,
    y,
    width: maxPt(width, ZERO_PT),
    height: maxPt(height, ZERO_PT),
  };
}

/**
 * Expand a rect by directional insets (positive insets expand outward).
 * Symmetric with insetRect: outsetRect(insetRect(r, i), i) ≈ r within epsilon.
 * Unlike insetRect, the result is not clamped — negative insets to outsetRect
 * will shrink the rect and can produce degenerate results if extreme.
 */
export function outsetRect(r: Rect, insets: Insets): Rect {
  return {
    x: subPt(r.x, insets.left),
    y: subPt(r.y, insets.top),
    width: addPt(addPt(r.width, insets.left), insets.right),
    height: addPt(addPt(r.height, insets.top), insets.bottom),
  };
}

/** Translate a rect by (dx, dy) without changing its size. */
export function offsetRect(r: Rect, dx: Points, dy: Points): Rect {
  return { x: addPt(r.x, dx), y: addPt(r.y, dy), width: r.width, height: r.height };
}

/** Translate a rect by a Point vector. Equivalent to offsetRect(r, by.x, by.y). */
export function translateRect(r: Rect, by: Point): Rect {
  return offsetRect(r, by.x, by.y);
}

/**
 * Scale a rect uniformly (both origin and size scale from the coordinate
 * origin). To scale around a different pivot, translate before and after.
 */
export function scaleRect(r: Rect, scalar: number): Rect {
  return {
    x: mulPt(r.x, scalar),
    y: mulPt(r.y, scalar),
    width: mulPt(r.width, scalar),
    height: mulPt(r.height, scalar),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 14  Insets operations
// ─────────────────────────────────────────────────────────────────────────────

export function addInsets(a: Insets, b: Insets): Insets {
  return {
    top: addPt(a.top, b.top),
    right: addPt(a.right, b.right),
    bottom: addPt(a.bottom, b.bottom),
    left: addPt(a.left, b.left),
  };
}

/** Scale all four inset values by a dimensionless scalar. */
export function scaleInsets(i: Insets, scalar: number): Insets {
  return {
    top: mulPt(i.top, scalar),
    right: mulPt(i.right, scalar),
    bottom: mulPt(i.bottom, scalar),
    left: mulPt(i.left, scalar),
  };
}

export function insetsEqual(
  a: Insets,
  b: Insets,
  epsilon: Points = PT_EPSILON,
): boolean {
  return (
    ptEq(a.top, b.top, epsilon) &&
    ptEq(a.right, b.right, epsilon) &&
    ptEq(a.bottom, b.bottom, epsilon) &&
    ptEq(a.left, b.left, epsilon)
  );
}

/** Sum of left and right inset values. */
export function insetsHorizontal(i: Insets): Points {
  return addPt(i.left, i.right);
}

/** Sum of top and bottom inset values. */
export function insetsVertical(i: Insets): Points {
  return addPt(i.top, i.bottom);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 15  Standard page sizes (in Points)
// ─────────────────────────────────────────────────────────────────────────────
//
// Frozen constants for common paper sizes. Referenced by the document model's
// Section entity page-setup defaults. All values are computed from their
// authoritative source units (inches or mm) via the conversion functions above
// to avoid transcription errors.

/** US Letter: 8.5 × 11 in (612 × 792 pt). */
export const PAGE_SIZE_LETTER: Readonly<Size> = Object.freeze<Size>({
  width: inchesToPt(8.5),
  height: inchesToPt(11),
});

/** US Legal: 8.5 × 14 in (612 × 1008 pt). */
export const PAGE_SIZE_LEGAL: Readonly<Size> = Object.freeze<Size>({
  width: inchesToPt(8.5),
  height: inchesToPt(14),
});

/** ISO A4: 210 × 297 mm (≈ 595.28 × 841.89 pt). */
export const PAGE_SIZE_A4: Readonly<Size> = Object.freeze<Size>({
  width: mmToPt(210),
  height: mmToPt(297),
});

/** ISO A3: 297 × 420 mm (≈ 841.89 × 1190.55 pt). */
export const PAGE_SIZE_A3: Readonly<Size> = Object.freeze<Size>({
  width: mmToPt(297),
  height: mmToPt(420),
});

/** ISO A5: 148 × 210 mm (≈ 419.53 × 595.28 pt). */
export const PAGE_SIZE_A5: Readonly<Size> = Object.freeze<Size>({
  width: mmToPt(148),
  height: mmToPt(210),
});

/** ISO B5: 176 × 250 mm (≈ 498.90 × 708.66 pt). */
export const PAGE_SIZE_B5: Readonly<Size> = Object.freeze<Size>({
  width: mmToPt(176),
  height: mmToPt(250),
});

// ─────────────────────────────────────────────────────────────────────────────
// § 16  Render boundary — ResolutionContext
// ─────────────────────────────────────────────────────────────────────────────
//
// ▲ LAYER BOUNDARY ▲
// Everything from here to the end of the file is for exclusive use by
// Layer 3 (rendering-core) and Layer 4 (apps). Layer 1 and Layer 2 code
// must not import or reference any symbol defined below this line.

/**
 * The physical resolution of a rendering target, used at the Layer 2 → 3
 * boundary to convert canonical Points values into pixel coordinates.
 *
 * dpi
 *   Logical pixel density. Use SCREEN_DPI (96) for browser screen rendering;
 *   PRINT_DPI (72) for print targets where 1 pt should map to 1 CSS unit
 *   before the print engine applies its own scaling.
 *
 * devicePixelRatio
 *   Ratio of physical device pixels to CSS logical pixels. Typically 1.0 for
 *   standard displays and 2.0–3.0 for HiDPI/Retina. Used by the Rendering
 *   Core only when sizing a canvas backing store:
 *     canvas.width = cssWidth * devicePixelRatio
 *   For DOM/CSS coordinate positioning, devicePixelRatio is irrelevant — use
 *   toCSSPixels() exclusively for CSS style properties.
 */
export interface ResolutionContext {
  readonly dpi: number;
  readonly devicePixelRatio: number;
}

/**
 * Construct a validated ResolutionContext.
 * Throws RangeError if dpi or devicePixelRatio are non-positive.
 */
export function makeResolutionContext(
  dpi: number,
  devicePixelRatio: number = 1,
): ResolutionContext {
  if (dpi <= 0) {
    throw new RangeError(
      `makeResolutionContext: dpi must be positive, received ${dpi}`,
    );
  }
  if (devicePixelRatio <= 0) {
    throw new RangeError(
      `makeResolutionContext: devicePixelRatio must be positive, received ${devicePixelRatio}`,
    );
  }
  return { dpi, devicePixelRatio };
}

/**
 * Standard screen rendering context at 96 DPI, 1× pixel ratio.
 *
 * For actual browser rendering read window.devicePixelRatio at mount time and
 * supply it via makeResolutionContext(SCREEN_DPI, window.devicePixelRatio)
 * when sizing the canvas backing store. This constant is appropriate for SSR
 * and for measurement passes that run before the browser environment is known.
 */
export const SCREEN_RESOLUTION: Readonly<ResolutionContext> = Object.freeze(
  makeResolutionContext(SCREEN_DPI, 1),
);

/**
 * Print rendering context at 72 DPI (1 pt = 1 CSS unit in the print target).
 */
export const PRINT_RESOLUTION: Readonly<ResolutionContext> = Object.freeze(
  makeResolutionContext(PRINT_DPI, 1),
);

/**
 * Number of CSS logical pixels per point at the given resolution.
 * Example: at SCREEN_RESOLUTION (96 DPI) → 96 / 72 ≈ 1.3333 px/pt.
 * A 612 pt letter page maps to 816 CSS pixels.
 */
export function cssPixelsPerPoint(ctx: ResolutionContext): number {
  return ctx.dpi / POINTS_PER_INCH;
}

/**
 * Number of physical device pixels per point at the given resolution,
 * including the devicePixelRatio multiplier. Use this for canvas sizing and
 * canvas draw-call coordinates on HiDPI screens. Do NOT use for CSS styles.
 */
export function physicalPixelsPerPoint(ctx: ResolutionContext): number {
  return (ctx.dpi / POINTS_PER_INCH) * ctx.devicePixelRatio;
}

/**
 * Convert a Points scalar to CSS logical pixels.
 * Use for all DOM style properties: left, top, width, height, etc.
 */
export function toCSSPixels(value: Points, ctx: ResolutionContext): Pixels {
  return (value * cssPixelsPerPoint(ctx)) as Pixels;
}

/**
 * Convert a Points scalar to physical device pixels (CSS pixels × devicePixelRatio).
 * Use for canvas.width / canvas.height and all canvas 2D / WebGL draw calls
 * on HiDPI targets. The result must not be assigned to CSS style properties.
 */
export function toPhysicalPixels(value: Points, ctx: ResolutionContext): Pixels {
  return (value * physicalPixelsPerPoint(ctx)) as Pixels;
}

/**
 * Convert CSS logical pixels back to Points.
 * The inverse of toCSSPixels(). Used by the Editor adapter to translate
 * pointer-event clientX/clientY (CSS pixels) into document coordinates for
 * hit-testing and selection positioning.
 */
export function fromCSSPixels(value: Pixels, ctx: ResolutionContext): Points {
  return (value / cssPixelsPerPoint(ctx)) as Points;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 17  Pixel geometric types and render-boundary conversions
// ─────────────────────────────────────────────────────────────────────────────

/** Pixel-domain mirror of Point. Use only in Layer 3 and above. */
export interface PixelPoint {
  readonly x: Pixels;
  readonly y: Pixels;
}

/** Pixel-domain mirror of Size. Use only in Layer 3 and above. */
export interface PixelSize {
  readonly width: Pixels;
  readonly height: Pixels;
}

/** Pixel-domain mirror of Rect. Use only in Layer 3 and above. */
export interface PixelRect {
  readonly x: Pixels;
  readonly y: Pixels;
  readonly width: Pixels;
  readonly height: Pixels;
}

/** Pixel-domain mirror of Insets. Use only in Layer 3 and above. */
export interface PixelInsets {
  readonly top: Pixels;
  readonly right: Pixels;
  readonly bottom: Pixels;
  readonly left: Pixels;
}

export function makePixelPoint(x: Pixels, y: Pixels): PixelPoint {
  return { x, y };
}

export function makePixelSize(width: Pixels, height: Pixels): PixelSize {
  return { width, height };
}

export function makePixelRect(
  x: Pixels,
  y: Pixels,
  width: Pixels,
  height: Pixels,
): PixelRect {
  return { x, y, width, height };
}

/** Convert a Point (Points) to a PixelPoint in CSS logical pixels. */
export function pointToPixelPoint(p: Point, ctx: ResolutionContext): PixelPoint {
  return { x: toCSSPixels(p.x, ctx), y: toCSSPixels(p.y, ctx) };
}

/** Convert a Size (Points) to a PixelSize in CSS logical pixels. */
export function sizeToPixelSize(s: Size, ctx: ResolutionContext): PixelSize {
  return {
    width: toCSSPixels(s.width, ctx),
    height: toCSSPixels(s.height, ctx),
  };
}

/** Convert a Rect (Points) to a PixelRect in CSS logical pixels. */
export function rectToPixelRect(r: Rect, ctx: ResolutionContext): PixelRect {
  return {
    x: toCSSPixels(r.x, ctx),
    y: toCSSPixels(r.y, ctx),
    width: toCSSPixels(r.width, ctx),
    height: toCSSPixels(r.height, ctx),
  };
}

/**
 * Convert a Rect (Points) to a pixel-snapped PixelRect in CSS logical pixels.
 *
 * Snapping strategy: floor the origin edges, ceil the far edges, then derive
 * width and height from the snapped edges rather than rounding width/height
 * independently. This guarantees:
 *   (a) no rendered box is smaller than the layout computed it, and
 *   (b) abutting boxes share an exact pixel boundary with no sub-pixel gaps.
 *
 * Used by the Rendering Core for all page and line-box DOM placement.
 */
export function rectToSnappedPixelRect(
  r: Rect,
  ctx: ResolutionContext,
): PixelRect {
  const scale = cssPixelsPerPoint(ctx);
  const snappedX = Math.floor(r.x * scale) as Pixels;
  const snappedY = Math.floor(r.y * scale) as Pixels;
  const snappedRight = Math.ceil(rectRight(r) * scale) as Pixels;
  const snappedBottom = Math.ceil(rectBottom(r) * scale) as Pixels;
  return {
    x: snappedX,
    y: snappedY,
    width: (snappedRight - snappedX) as Pixels,
    height: (snappedBottom - snappedY) as Pixels,
  };
}

/** Convert an Insets (Points) to a PixelInsets in CSS logical pixels. */
export function insetsToPixelInsets(
  i: Insets,
  ctx: ResolutionContext,
): PixelInsets {
  return {
    top: toCSSPixels(i.top, ctx),
    right: toCSSPixels(i.right, ctx),
    bottom: toCSSPixels(i.bottom, ctx),
    left: toCSSPixels(i.left, ctx),
  };
}
