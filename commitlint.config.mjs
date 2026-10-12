// Commit messages follow Conventional Commits 1.0.0. AGENTS.md says how, and
// what the rules below are for.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Warnings in the preset. They are errors here, so that a message is
    // refused when it is written and doesn't surface later as a warning in CI.
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
  },
  // Two robots write messages nobody can reword. Both keep to the header's
  // form, and put a changelog or release notes, with long links, in the body.
  ignores: [
    (message) => /^chore\(main\): release \d+\.\d+\.\d+/.test(message),
    (message) => /^Signed-off-by: dependabot\[bot\]/m.test(message),
  ],
};
