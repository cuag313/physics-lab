/**
 * 2D向量工具
 */
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  clone() { return new Vec2(this.x, this.y) }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y) }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y) }
  mul(s) { return new Vec2(this.x * s, this.y * s) }
  div(s) { return new Vec2(this.x / s, this.y / s) }
  dot(v) { return this.x * v.x + this.y * v.y }
  cross(v) { return this.x * v.y - this.y * v.x }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y) }
  lengthSq() { return this.x * this.x + this.y * this.y }
  normalize() {
    const len = this.length()
    return len > 1e-10 ? this.div(len) : new Vec2(0, 0)
  }
  rotate(angle) {
    const c = Math.cos(angle), s = Math.sin(angle)
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c)
  }
  lerp(v, t) {
    return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t)
  }
  distanceTo(v) { return this.sub(v).length() }
  equals(v, eps = 1e-6) { return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps }

  static fromAngle(angle, length = 1) {
    return new Vec2(Math.cos(angle) * length, Math.sin(angle) * length)
  }
}
