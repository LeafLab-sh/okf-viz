# For agents working in this repository

[`CONTRIBUTING.md`](CONTRIBUTING.md) says what a change needs, and [`SPEC.md`](SPEC.md) what the package must do. This file covers what an agent gets wrong without being told. Most of it is about commit messages.

## Commit messages

Every commit follows [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification). commitlint checks each message in the `commit-msg` hook, and CI checks every commit of a pull request, so a message that breaks a rule can't be merged.

### The shape

```
<type>[(<scope>)][!]: <description>

[body]

[footers]
```

```
fix(cli): report an unreadable bundle directory in one line

The command ended in a stack trace when the directory couldn't be read.
It now prints the path and the reason, and exits 1.

Refs: #42
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### The header

- **Type**, then an optional scope in parentheses, an optional `!`, then a colon and one space, then the description. The specification requires this prefix.
- **Types allowed here:** `feat`, `fix`, `docs`, `test`, `build`, `ci`, `refactor`, `perf`, `style`, `chore`, `revert`. Anything else is refused.
- **`feat` is for a new feature and `fix` for a bug fix.** The specification says each must be used for that, and they are what a version number is derived from: `fix` is a patch, `feat` a minor version, a breaking change a major one. For the rest, choose by what changed:

  | Type | The change is to |
  |---|---|
  | `docs` | `SPEC.md`, `README.md` and other prose, with no change in behaviour |
  | `test` | Tests or fixtures only |
  | `build` | The build, dependencies, hooks, the justfile |
  | `ci` | The workflows in `.github/` |
  | `refactor` | Code, with no change in behaviour |
  | `perf` | Speed, with no other change in behaviour |
  | `style` | Formatting only |
  | `chore` | Upkeep that fits none of the above |
  | `revert` | A commit being undone |

- **Scope** is optional: a noun for the part of the codebase, such as `cli`, `viewer`, `core` or `spec`. Leave it out when the change isn't confined to one part.
- **Description:** begin with a lower-case letter and don't end with a full stop. Say what the commit does, in the imperative: `add`, not `added` or `adds`.
- **The whole header is at most 100 characters.**

### The body

- One blank line after the header, then free-form paragraphs. Say why the change was made and what a reader couldn't see from the diff.
- **No line longer than 100 characters.** Wrap at 72.
- **No line of the body may begin with a word followed by a colon and a space, or by a space and `#`.** This is the mistake to watch for. The specification defines a footer as exactly that, a word token followed by `: ` or ` #`, and says a footer's token uses `-` in place of spaces to tell the footer section from the body. A parser therefore takes the first such line to be where the footers begin. Wrapping a sentence can put one there by accident:

  ```
  buildGraph turns a bundle's files into the reference viewer's data
  shape: concepts with the reference's defaults, an edge per pair of
  ```

  The second line reads as a footer named `shape`, with no blank line before it, and commitlint refuses the message with `footer must have leading blank line`. `Note: …`, `Example: …`, `Fixes #12` and a line that happens to begin `default: …` do the same. Rewrap or reword so that the colon isn't after the first word of a line. A list item is safe, since it begins with `- `.

### Footers

- One blank line after the body, then every footer together, one to a line, with nothing after them.
- Each is `Token: value` or `Token #value`. A token has no spaces: `Reviewed-by`, `Refs`, `Co-Authored-By`. `BREAKING CHANGE` is the one token allowed a space.
- A reference to an issue goes here, as `Refs: #12`, not at the start of a line of the body.
- No line longer than 100 characters.

### Breaking changes

A change is breaking when someone who depends on the package has to change something: the library's functions and their types, the command's flags, or the embedded graph's `format` (`SPEC.md` §4). A change to the bytes of a generated viewer alone is not breaking, since `SPEC.md` §7 lets every version change them.

Mark one with `!` before the colon, or with a `BREAKING CHANGE: <what breaks, and what to do>` footer, in upper case. With both, the footer says more than the description has room for.

```
feat(cli)!: write the viewer to the current directory by default

BREAKING CHANGE: --out now defaults to ./viz.html, not <dir>/viz.html.
Pass --out <dir>/viz.html to keep the old place.
```

### Writing and checking one

- Pass a message of more than one line from a file or standard input, `git commit -F -`, so that its blank lines survive. Several `-m` flags are easy to get wrong.
- Check a message before committing: `pnpm exec commitlint < message.txt`. It prints nothing when the message is right.
- Check a branch's commits as CI will: `pnpm exec commitlint --from origin/main --to HEAD`.
- Don't pass `--no-verify`. CI repeats the check, so it only moves the failure to where it costs more.
- A message already pushed is fixed by rewriting the commit, which changes its hash and every one after it. Ask before doing that to a branch someone else may have.

## Releases

release-please makes the releases from the commit messages on `main`: it derives the next version from their types and writes `CHANGELOG.md` from their descriptions. So:

- **Never edit the version in `package.json`, `.release-please-manifest.json` or `CHANGELOG.md`.** The release pull request does.
- **A commit's type is a decision about the version.** `feat` and `fix` appear in the changelog and raise the version. Use them only for what someone using the package would notice, and `refactor`, `test`, `build`, `ci`, `docs` or `chore` for the rest.
- **A description is a changelog line.** It is read by someone who doesn't have the diff.
- **Don't tag a release or publish by hand.** Merging the release pull request does both.

## Other things that go wrong

- **CI is the reference.** A change is right when it passes there, on Linux and Windows. `just check` runs the same things locally. Run it before saying a change works.
- **The golden viewers are compared byte for byte.** A change to anything in `src/viewer/` changes them. They hold a fixed version in place of the package's, so a release doesn't. Run `just update-golden` and read the diff.
- **Never write a line separator, a byte-order mark or a control character into a source file as the character itself.** Write the escape, such as `\u2028`. Tools that take text from an agent can turn an escape into the character on the way to the file. After writing a file that holds one, search the file for the raw character.
- **`test/fixtures/` is not to be reformatted,** by hand or by a tool. Its files are compared byte for byte, and those under `okf/` are another project's.
- **`src/generated/` is build output.** Change `src/viewer/` or `scripts/build-assets.mjs`, then run `just assets`.

## Working in LeafLab-sh

This repository follows the LeafLab-sh org's standards. They're specified in the org spec store, [`LeafLab-sh/openspec`](https://github.com/LeafLab-sh/openspec) (store id `leaflab`). This section says where to find them, not what they all say.

### Process

- **Commits** (`standards/commit-messages`): Conventional Commits, a `Refs: LEA-<n>` footer for Linear work, and no `fixup!` commits left on `main`.
- **Pull requests** (`standards/pull-requests`): open as a draft, and mark ready after self-review once CI passes. Fix findings with `fixup!` commits and autosquash before merging. Link Linear with `Fixes LEA-<n>` or `Part of LEA-<n>` in the body. Merge by rebase only.
- **Branches** (`integrations/linear`): `lea/lea-<n>-<slug>`, named after the Linear issue.

### Reviewing specs

This project's own specs are in `openspec/specs/`:

```sh
openspec list --specs
openspec show <spec-id> --type spec
```

The org's specs are in the `leaflab` store, which `openspec/config.yaml` references. Pull your clone of the store first, because OpenSpec never does. `openspec context` shows where the clone is.

```sh
openspec list --specs --store leaflab
openspec show <spec-id> --type spec --store leaflab
```

If `openspec doctor` reports the `leaflab` reference as unresolved, clone and register the store as its README says.

### Contributing to specs

- **This project's behavior:** an OpenSpec change in this repository. Use `/opsx:propose` (or `openspec new change <id>`), pass `openspec validate <id> --strict`, and run `openspec archive <id>` in the pull request that implements it.
- **An org standard, an integration, or how repositories are set up:** an OpenSpec change in `LeafLab-sh/openspec`, by pull request there. Never write the store from this repository.

## Works Cited

*Conventional Commits 1.0.0*. Conventional Commits, www.conventionalcommits.org/en/v1.0.0/. Accessed 11 Oct. 2026.
