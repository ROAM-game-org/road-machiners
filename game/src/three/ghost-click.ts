export const GHOST_CLICK_MS = 400;

type ClickTarget = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout">;

export function swallowNextClick(target: ClickTarget = window): void {
  const stop = (e: Event): void => {
    e.stopPropagation();
    e.preventDefault();
    target.removeEventListener("click", stop, true);
  };
  target.addEventListener("click", stop, true);
  target.setTimeout(() => target.removeEventListener("click", stop, true), GHOST_CLICK_MS);
}
