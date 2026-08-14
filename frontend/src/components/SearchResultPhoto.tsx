// Track/car result photo pinned to the right half of a compact result row (a
// real <img> with object-fit: cover, same technique as TrackHero/CarHero — a
// CSS background-size percentage would stretch it instead of cropping to
// fit), with a gradient overlay sized to exactly that same box so it reads
// as "starts at 50% of the row, ends at 100%": opaque at the box's own left
// edge (blends into the row, right where the text sits) fading to
// transparent at its right edge (revealing the photo fully at the row's
// outer edge). Shared by Navbar.tsx's search dropdown and CarPickerModal.
export function SearchResultPhoto({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <>
      <img className="navbar-search-result-photo" src={url} alt="" />
      <span className="navbar-search-result-fade" aria-hidden="true" />
    </>
  );
}
