const SVG_NS = "http://www.w3.org/2000/svg";

// Reuses GitLab's own icon sprite so icons match the rest of the page.
// Returns null when the sprite can't be found on the page.
export const createGitlabIcon = (name: string) => {
  const spriteHref = document
    .querySelector("svg.gl-icon use[href*='.svg#']")
    ?.getAttribute("href");
  if (!spriteHref) {
    return null;
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("gl-button-icon", "gl-icon", "s16", "gl-fill-current");

  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${spriteHref.split("#")[0]}#${name}`);
  svg.appendChild(use);

  return svg;
};
