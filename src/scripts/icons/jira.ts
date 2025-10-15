export const createJiraIcon = () => {
  const jiraSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  jiraSvg.setAttribute("viewBox", "0 0 24 24");
  jiraSvg.setAttribute("height", "16");
  jiraSvg.setAttribute("width", "16");
  jiraSvg.setAttribute("fill", "none");

  // Create the three path elements from the comment
  const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path1.setAttribute("stroke", "#FFF");
  path1.setAttribute("stroke-linecap", "round");
  path1.setAttribute("stroke-linejoin", "round");
  path1.setAttribute(
    "d",
    "M17 8a1 1 0 0 0 -1 -1H6.5l0.01 0.066a4 4 0 0 0 3.96 3.434h3.03v3.03a4 4 0 0 0 3.434 3.96l0.066 0.01V8Z",
  );
  path1.setAttribute("stroke-width", "1");
  path1.setAttribute("fill", "none");

  const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path2.setAttribute("stroke", "#FFF");
  path2.setAttribute("stroke-linecap", "round");
  path2.setAttribute("stroke-linejoin", "round");

  path2.setAttribute(
    "d",
    "M11.5 13.5a1 1 0 0 0 -1 -1h-9l0.01 0.066A4 4 0 0 0 5.47 16H8v2.53a4 4 0 0 0 3.434 3.96l0.066 0.01v-9Z",
  );
  path2.setAttribute("stroke-width", "1");
  path2.setAttribute("fill", "none");

  const path3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path3.setAttribute("stroke", "#FFF");
  path3.setAttribute("stroke-linecap", "round");
  path3.setAttribute("stroke-linejoin", "round");
  path3.setAttribute(
    "d",
    "M22.5 2.5a1 1 0 0 0 -1 -1h-10l0.01 0.066A4 4 0 0 0 15.47 5H19v3.53a4 4 0 0 0 3.434 3.96l0.066 0.01v-10Z",
  );
  path3.setAttribute("stroke-width", "1");
  path3.setAttribute("fill", "none");

  jiraSvg.appendChild(path1);
  jiraSvg.appendChild(path2);
  jiraSvg.appendChild(path3);

  return jiraSvg;
};

