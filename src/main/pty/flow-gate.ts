/**
 * The renderer-ack watermark scheme (the VS Code pattern). Pure accounting:
 * the PtyManager tells it how many chars it shipped to the renderer with add(),
 * the renderer acks how many it has drained with ack(). When outstanding (sent
 * but not yet acked) crosses the high watermark we ask the caller to pause the
 * PTY; when acks bring it back below the low watermark we ask it to resume.
 *
 * Two watermarks (not one) give hysteresis so a busy stream doesn't flap
 * pause/resume around a single threshold. Each signal fires exactly once per
 * crossing: add() returns 'pause' only on the transition into paused, ack()
 * returns 'resume' only on the transition back out.
 */
export class FlowGate {
  private outstanding = 0
  private paused = false

  constructor(
    private readonly highWater: number,
    private readonly lowWater: number,
  ) {}

  /** Account for `units` shipped to the renderer. Returns 'pause' on the crossing. */
  add(units: number): 'pause' | null {
    this.outstanding += units
    if (!this.paused && this.outstanding >= this.highWater) {
      this.paused = true
      return 'pause'
    }
    return null
  }

  /** Account for `units` the renderer has drained. Returns 'resume' on the crossing. */
  ack(units: number): 'resume' | null {
    this.outstanding = Math.max(0, this.outstanding - units)
    if (this.paused && this.outstanding < this.lowWater) {
      this.paused = false
      return 'resume'
    }
    return null
  }

  /** Forget all accounting (the PTY is gone). */
  reset(): void {
    this.outstanding = 0
    this.paused = false
  }
}
