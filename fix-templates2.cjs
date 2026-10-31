const fs = require("fs");
const path = require("path");

function convertTmpl(tmpl) {
  const parts = [];
  let last = 0;
  const re = /\$\{([^{}]+)\}/g;
  let m;
  while ((m = re.exec(tmpl)) !== null) {
    if (m.index > last) parts.push(JSON.stringify(tmpl.slice(last, m.index)));
    parts.push("(" + m[1] + ")");
    last = m.index + m[0].length;
  }
  if (last < tmpl.length) parts.push(JSON.stringify(tmpl.slice(last)));
  return parts.join(" + ");
}

const dir = "./api";
let changed = 0;
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".mjs")) continue;
  const full = path.join(dir, file);
  let content = fs.readFileSync(full, "utf8");
  const orig = content;
  let prev = "";
  while (content !== prev) {
    prev = content;
    content = content.replace(/`([\s\S]*?)`/g, (match, tmpl) => "(" + convertTmpl(tmpl) + ")");
  }
  if (content !== orig) {
    fs.writeFileSync(full, content);
    changed++;
    console.log("Fixed:", file);
  }
}
console.log("Total files changed:", changed);
