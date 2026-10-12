// A bundle whose every piece of text tries to run script, load something or
// leave the page (SPEC §9, T4 and T5). A payload that runs calls
// window.__pwned with a tag saying where it was planted.

const pwn = (tag: string) => `__pwned('${tag}')`;

/** Markup that would run script or fetch from a server the bundle names. */
const markup = (tag: string) =>
  [
    `<script>${pwn(`${tag}-script`)}</script>`,
    `<img src="x" onerror="${pwn(`${tag}-onerror`)}">`,
    `</script><script>${pwn(`${tag}-break`)}</script>`,
    `<svg onload="${pwn(`${tag}-svg`)}"></svg>`,
    `<details open ontoggle="${pwn(`${tag}-toggle`)}">x</details>`,
    `<input autofocus onfocus="${pwn(`${tag}-focus`)}">`,
    `<a id="${tag}-anchor" href="javascript:${pwn(`${tag}-href`)}">raw anchor</a>`,
    `<img src="https://evil.example/${tag}-raw.png">`,
    `<iframe src="https://evil.example/${tag}-frame"></iframe>`,
    `<object data="https://evil.example/${tag}-object"></object>`,
    `<link rel="stylesheet" href="https://evil.example/${tag}.css">`,
    `<style>@import url("https://evil.example/${tag}-import.css");</style>`,
    `<video src="https://evil.example/${tag}.mp4" autoplay></video>`,
    `<base href="https://evil.example/">`,
    `<form action="https://evil.example/${tag}-form"><button>go</button></form>`,
  ].join("\n");

const body = (tag: string) =>
  [
    "# A hostile body",
    "",
    markup(tag),
    "",
    `[markdown link](javascript:${pwn(`${tag}-mdlink`)})`,
    `[data link](data:text/html,<script>${pwn(`${tag}-data`)}</script>)`,
    `![remote image](https://evil.example/${tag}-md.png)`,
    `![protocol-relative image](//evil.example/${tag}-rel.png)`,
    "",
    "A [real link](benign.md) to keep the viewer honest.",
    "",
  ].join("\n");

// JSON is YAML, so each value is written exactly, whatever it holds.
const frontmatter = (fields: Record<string, unknown>) =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n---\n\n`;

const hostileFields = (tag: string) => ({
  type: `<img src=x onerror="${pwn(`${tag}-type`)}">`,
  title: `</script><script>${pwn(`${tag}-title`)}</script><img src=x onerror="${pwn(`${tag}-title-img`)}">`,
  description: markup(`${tag}-description`),
  resource: `javascript:${pwn(`${tag}-resource`)}`,
  tags: [`<img src=x onerror="${pwn(`${tag}-tag`)}">`, `"><script>${pwn(`${tag}-tag2`)}</script>`],
  status: `stable" onmouseover="${pwn(`${tag}-status`)}`,
  generated: { by: `<img src=x onerror="${pwn(`${tag}-generated`)}">`, at: "<b>when</b>" },
  verified: [{ by: `human:<img src=x onerror="${pwn(`${tag}-verified`)}">`, at: "<i>then</i>" }],
  stale_after: `<img src=x onerror="${pwn(`${tag}-stale`)}">`,
  sources: [
    {
      title: `<img src=x onerror="${pwn(`${tag}-source-title`)}">`,
      resource: `javascript:${pwn(`${tag}-source`)}`,
    },
    { title: "remote", resource: "http://evil.example/insecure" },
    { resource: `data:text/html,<script>${pwn(`${tag}-source-data`)}</script>` },
  ],
});

/** The hostile bundle. `metaRefresh` adds a body that tries to navigate away. */
export function hostileBundle(options: { metaRefresh: boolean }): Record<string, string> {
  const files: Record<string, string> = {
    "index.md": `# Index\n\n${markup("index")}\n`,
    "benign.md": `${frontmatter({ type: "Reference", title: "Benign" })}Nothing to see.\n`,
    "hostile.md": frontmatter(hostileFields("fm")) + body("body"),
    "no-frontmatter.md": body("bare"),
    // Names from Object.prototype, as a concept, a type and a tag.
    "__proto__.md":
      frontmatter({ type: "__proto__", title: "__proto__", tags: ["constructor", "__proto__"] }) +
      "Links to [constructor](constructor.md) and [hostile](hostile.md).\n",
    "constructor.md": `${frontmatter({ type: "constructor", title: "toString" })}Back to [proto](__proto__.md).\n`,
    // Markup in a file's name, which becomes a concept ID and a label.
    [`<img src=x onerror="${pwn("id")}">.md`]: `Named to be read as markup.\n\n${markup("named")}\n`,
  };
  if (options.metaRefresh) {
    files["refresh.md"] =
      frontmatter({ type: "Reference", title: "Refresh" }) +
      '<meta http-equiv="refresh" content="0;url=https://evil.example/refreshed">\n';
  }
  return files;
}
