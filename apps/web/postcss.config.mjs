/**
 * PostCSS configuration for the Next.js app.
 *
 * The Tailwind utility pipeline runs in PostCSS. Without this
 * file, Next.js's CSS loader has no PostCSS plugins to invoke,
 * Tailwind never scans `app/**` and `components/**` for class
 * names, and the shipped CSS is just the `@layer base` content
 * from `styles/globals.css`. That is why every page in this app
 * looked like unstyled HTML until this file was added.
 *
 * Plugins:
 *   - tailwindcss     : expand the @tailwind directives in globals.css
 *                       and generate the utility classes that the
 *                       content paths in tailwind.config.ts picked up.
 *   - autoprefixer    : vendor prefixes for older browsers.
 *
 * `tailwindcss-animate` is a Tailwind plugin (registered in
 * tailwind.config.ts), not a PostCSS plugin, and does not need
 * to be listed here.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
