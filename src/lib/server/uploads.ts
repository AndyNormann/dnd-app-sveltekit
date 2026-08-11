/** Where uploaded map images are stored. Overridable so container deploys can
 * point this at a mounted volume. Served by /uploads/[...file] at runtime. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? 'static/uploads';
