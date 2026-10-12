set windows-shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

# List the recipes
default:
    @just --list

# Install dependencies from the lockfile
install:
    pnpm install --frozen-lockfile

# Compile the viewer sources into src/generated/assets.ts
assets:
    pnpm build:assets

# Build dist/
build:
    pnpm build

# Check formatting, lint, and trailing whitespace, changing nothing: what CI runs
lint:
    pnpm lint

# Format and apply the linter's safe fixes, and strip trailing whitespace
format:
    pnpm format

# Type-check sources and tests
typecheck:
    pnpm typecheck

# Run the unit tests; arguments go to vitest, e.g. `just test test/unit/assets.test.ts`
test *args:
    pnpm test {{args}}

# Run the browser tests; arguments go to Playwright, e.g. `just test-browser --project firefox`
test-browser *args:
    pnpm test:browser {{args}}

# Build, then run the built package in a Workers runtime
test-workers:
    pnpm test:workers

# Download the browsers the browser tests need
browsers:
    pnpm exec playwright install chromium firefox

# Rewrite the golden viewers in test/fixtures/golden; review the diff before committing
update-golden $UPDATE_GOLDEN="1":
    pnpm test test/golden

# Refresh the vendored OKF bundles and reference graphs (needs gh, tar, Python with PyYAML)
vendor-okf:
    node scripts/vendor-okf-fixtures.mjs

# Everything CI runs
check: lint typecheck test test-workers test-browser

# Remove build output
clean:
    node scripts/clean.mjs
