export interface ProgressRenderer {
  /**
   * Initialize the renderer with a list of items to track
   */
  initialize(items: any[]): void;

  /**
   * Update the progress of a specific item
   */
  update(id: string, data: any): void;

  /**
   * Stop the renderer and clean up
   */
  stop(): void;
}
