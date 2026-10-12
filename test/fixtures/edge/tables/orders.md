---
type: BigQuery Table
title: Orders
description: One row per order.
resource: https://example.com/tables/orders
tags: [sales, core]
status: stable
generated:
  by: agent:reference
  at: 2026-09-01T00:00:00Z
verified:
  by: human:lea
  at: 2026-09-02T00:00:00Z
stale_after: 2026-12-31T00:00:00Z
sources:
  - title: Data dictionary
    resource: https://example.com/dictionary
  - resource: /notes/plain.md
---

# Schema

Joins to [customers](customers.md) and to [a missing table](missing.md).
See [the plain note](/notes/plain.md) and [itself](orders.md).
Outside the bundle: [up](../../outside.md). Elsewhere: [site](https://example.com/page.md).
