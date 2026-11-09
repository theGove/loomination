// A title reduced to what Teather allows in a file name: letters, digits and
// hyphens, at most 50 characters ("Rosépath towels, #3!" -> "Rosepath-towels-3").
export function slugify(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}
