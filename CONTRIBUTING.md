# Contributing

Changes come in as pull requests against `main`, from a branch or from a fork. `main` is protected: nothing is pushed to it directly, and a pull request merges only when CI passes.

## Setting up

You need [Node](https://nodejs.org) at the version in `.node-version`, [pnpm](https://pnpm.io) at the version in `package.json`, and [just](https://just.systems).

```sh
just install    # dependencies, from the lockfile; also sets up the Git hooks
just browsers   # the browsers the browser tests drive
just check      # everything CI runs
```

## What a change needs

- **It passes CI.** CI is the reference: a change is right when it passes there, on Linux and Windows, whatever it did on your machine. `just check` runs the same things locally.
- **Its commits follow [Conventional Commits](https://www.conventionalcommits.org)**, such as `fix: resolve links that end in a fragment`. A hook checks each message as you commit, and CI checks every commit of the pull request. The messages decide the next version and are the changelog, so `feat` and `fix` are for what a user of the package would notice.
- **It leaves the version and `CHANGELOG.md` alone.** A release sets both.
- **Its commits are the ones that land.** Pull requests are merged by rebase only, so each commit goes onto `main` as it is, with its own message. Tidy a branch's history before asking for it to be merged.
- **It is formatted and linted.** A hook does this to the files you stage. `just format` does it to everything.
- **It comes with a test** that fails without the change.
- **It keeps to [`SPEC.md`](SPEC.md).** A change in behaviour changes the specification in the same pull request. §2 lists the rules that must not regress.

If you change the viewer's template, stylesheet or script, the generated viewers' bytes change. Run `just update-golden`, and include the golden files' diff in the pull request, where it is reviewed like code.

## Pull requests from forks

CI runs on a fork's pull request with a read-only token and no secrets. A maintainer may have to approve the run before it starts.

A fork carries the release workflow too, but it publishes only from this repository.

## Dependabot

Dependabot's pull requests merge by themselves once CI passes on them. One that fails stays open for someone to look at.

## Security

Don't open an issue or a pull request for a vulnerability. [`SECURITY.md`](SECURITY.md) says how to report one privately.

## Licence

The project is under the Apache License 2.0. By contributing you agree that your contribution is licensed under it, as section 5 of the [licence](LICENSE) provides.
