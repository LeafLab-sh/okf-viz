# Security

A viewer file renders text from an OKF bundle in the reader's browser. A bundle's text can come from documents its maintainer didn't write, so a way to make a generated viewer run script, load a remote resource, or navigate somewhere unexpected is a vulnerability in this package. [`SPEC.md`](SPEC.md) §6 states what the viewer guarantees.

## Reporting

Report a vulnerability privately through this repository's **Security** tab, using "Report a vulnerability". Please don't open a public issue for it.

Include the bundle text that triggers the problem and the browser you used.
