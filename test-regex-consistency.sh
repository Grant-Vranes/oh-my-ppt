# Test how the browser-scripts regex actually behaves
# The key issue: this regex is embedded in a TypeScript template literal string.
# In template literals: \\ becomes \, so \\s becomes \s, \\. becomes \., \\d becomes \d
# So the SOURCE file has: /^M\\s+-?\\d+(?:\\.\\d+)?\\s+.../i
# After template literal processing (in browser): /^M\s+-?\d+(?:\.\d+)?\s+.../i

# Let's test what the browser actually sees
node -e '
// This is what the browser gets after template literal processing
const browserRe = /^M\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+L\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s*$/i;
console.log("Source:", browserRe.source);
console.log("M 0.5 0 L 120.5 30.25 =>", browserRe.test("M 0.5 0 L 120.5 30.25"));
console.log("M 10 20 L 150 80 =>", browserRe.test("M 10 20 L 150 80"));
console.log("M 0 0 C 50 50 100 50 150 0 =>", browserRe.test("M 0 0 C 50 50 100 50 150 0"));
'

echo "---"

# Now test the OTHER regex (html-utils.ts and animation-writer.ts which are regular TypeScript, not template literals)
node -e '
// Regular TypeScript regex (not in template literal)
const tsRe = /^M\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+L\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s*$/i;
console.log("Source:", tsRe.source);
console.log("M 0.5 0 L 120.5 30.25 =>", tsRe.test("M 0.5 0 L 120.5 30.25"));
console.log("M 10 20 L 150 80 =>", tsRe.test("M 10 20 L 150 80"));
console.log("M 0 0 C 50 50 100 50 150 0 =>", tsRe.test("M 0 0 C 50 50 100 50 150 0"));
'

echo "---"

# Now verify the SOURCE FILE has the correct escaping
node -e '
const fs = require("fs");
const content = fs.readFileSync("/home/jacob/ref/oh-my-ppt-fork/src/main/utils/html-pptx/browser-scripts.ts", "utf-8");
const lines = content.split("\n");
let found = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("LINEAR_PATH_RE") && lines[i].includes("/^M")) {
    console.log("Line", i+1, ":", lines[i].trim());
    // Check if there is a triple backslash before dot: \\\\\\.
    // In the source, we need to see: \\\\. which in the file looks like: \\\\.
    // Let us check the raw characters
    const raw = lines[i];
    if (raw.includes("\\\\\\\\.")) {
      console.log("  WARNING: Contains \\\\\\\\. (quadruple backslash + dot) - THIS IS WRONG");
    } else if (raw.includes("\\\\.")) {
      console.log("  OK: Contains \\\\. (double backslash + dot) - CORRECT for template literal");
    } else if (raw.includes("\\.")) {
      console.log("  WARNING: Contains \\. (backslash + dot) - THIS IS WRONG, should be \\\\.");
    }
    found = true;
    break;
  }
}
if (!found) console.log("Regex line not found!");
' 2>&1