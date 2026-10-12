// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified by LeafLab, 2026: derived from the Open Knowledge Format reference
// viewer (src/reference_agent/viewer/static/viz.js). The changes are listed in
// SPEC.md §5.2, §6 and §8.

import {
  type BundleIndex,
  byInnermost,
  dirOf,
  resolveConceptId,
  resolveRepoConceptId,
} from "../core/links.js";
import type { ActorEvent, Graph, Node } from "../types.js";
import { renderBody } from "./sanitize.js";
import { isStale } from "./stale.js";

// The two libraries, loaded by the script elements before this one.
declare const cytoscape: ((options: unknown) => any) | undefined;
declare const marked: unknown;

type Payload = { name: string; assetBase: string; graph: Graph };

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Bundle text is only ever put on the page as text.
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.textContent = text;
  if (className !== undefined) created.className = className;
  return created;
}

// A frontmatter value as text: YAML may have given anything.
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Whether a string is an absolute `https:` URL, the only kind linked to. */
export function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function externalLink(href: string, label: string): HTMLAnchorElement {
  const a = element("a", label, "external");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

const STATUS_CLASSES = new Set(["stable", "draft", "deprecated"]);

function formatActorEvent(event: ActorEvent | undefined): string {
  const by = text(event?.by);
  if (by === "") return "—";
  const at = text(event?.at);
  return at === "" ? by : `${by} · ${at}`;
}

function main(): void {
  const payload = JSON.parse(byId("okf-data").textContent ?? "") as Payload;
  const { graph, name } = payload;

  document.title = `${name} — OKF Viewer`;
  byId("bundle-name").textContent = name;
  byId("generator").textContent = graph.generator;

  if (typeof cytoscape === "undefined" || typeof marked === "undefined") {
    byId("offline").hidden = false;
    byId("viewer").hidden = true;
    return;
  }

  // Maps, not objects: a concept may be named "constructor" or "__proto__".
  const nodes = new Map<string, Node>(graph.nodes.map((n) => [n.data.id, n.data]));
  const bodies = new Map<string, string>(Object.entries(graph.bodies));
  const backlinks = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const { source, target } = edge.data;
    const sources = backlinks.get(target);
    if (sources === undefined) backlinks.set(target, [source]);
    else sources.push(source);
  }

  // Where a concept sits: the directory its links and images are resolved
  // from, how a link is resolved there, and what its images' paths begin with.
  type Place = {
    dir: string;
    resolve(target: string, fromDir: string): string | null;
    imageBase: string;
    bundleTitle: string;
  };
  const repoBundles = graph.bundles ?? [];
  const titles = new Map<string, string>(repoBundles.map((b) => [b.slug, b.title]));
  const indexes = new Map<string, BundleIndex>(
    repoBundles.map((b) => [
      b.slug,
      { slug: b.slug, root: b.root, has: (id: string) => nodes.has(`${b.slug}/${id}`) },
    ]),
  );
  const innermost = byInnermost(Array.from(indexes.values()));
  function placeOf(id: string, data: Node): Place {
    const own = data.bundle === undefined ? undefined : indexes.get(data.bundle);
    if (own === undefined) {
      return {
        dir: dirOf(id),
        resolve: (target, fromDir) => resolveConceptId(target, fromDir, (c) => nodes.has(c)),
        imageBase: payload.assetBase,
        bundleTitle: "",
      };
    }
    // In a repo viewer an ID begins with its bundle's slug (SPEC §4.1).
    const root = own.root.split("/").map(encodeURIComponent).join("/");
    return {
      dir: dirOf(id.slice(own.slug.length + 1)),
      resolve: (target, fromDir) => resolveRepoConceptId(target, fromDir, own, innermost),
      imageBase: payload.assetBase + (root === "" ? "" : `${root}/`),
      bundleTitle: titles.get(own.slug) ?? own.slug,
    };
  }

  const typeSelect = byId<HTMLSelectElement>("filter-type");
  for (const type of graph.types) {
    const option = element("option", type);
    option.value = type;
    typeSelect.append(option);
  }

  // Repo viewer only: a filter by bundle.
  const bundleSelect = byId<HTMLSelectElement>("filter-bundle");
  bundleSelect.hidden = repoBundles.length === 0;
  for (const bundle of repoBundles) {
    const option = element("option", bundle.title);
    option.value = bundle.slug;
    bundleSelect.append(option);
  }

  // Cytoscape keeps its elements in objects keyed by id, and fails on an id
  // such as "constructor". So its ids are made here, and a concept's own ID
  // is carried as data.
  const cyIds = new Map<string, string>(graph.nodes.map((n, i) => [n.data.id, `n${i}`]));
  const elements = [
    ...graph.nodes.map((n) => ({
      data: {
        ...n.data,
        id: cyIds.get(n.data.id),
        concept: n.data.id,
        // In a repo viewer a node is labelled with its bundle.
        display: n.data.bundle === undefined ? n.data.label : `${n.data.label}\n[${n.data.bundle}]`,
      },
    })),
    ...graph.edges.map((e, i) => ({
      data: { id: `e${i}`, source: cyIds.get(e.data.source), target: cyIds.get(e.data.target) },
    })),
  ];

  const cy = cytoscape({
    container: byId("graph"),
    elements,
    style: [
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          label: "data(display)",
          color: "#0f172a",
          "font-size": 11,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-wrap": "wrap",
          "text-max-width": 120,
          width: "data(size)",
          height: "data(size)",
          "border-width": 1,
          "border-color": "#0f172a",
        },
      },
      {
        selector: "node.stale",
        style: { "border-width": 2, "border-color": "#b91c1c", "border-style": "dashed" },
      },
      { selector: 'node[status = "deprecated"]', style: { opacity: 0.55 } },
      { selector: "node:selected", style: { "border-width": 3, "border-color": "#f59e0b" } },
      {
        selector: "edge",
        style: {
          width: 1.5,
          "line-color": "#cbd5e1",
          "target-arrow-color": "#cbd5e1",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.9,
        },
      },
      {
        selector: "edge:selected",
        style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", width: 2.5 },
      },
      { selector: ".dim", style: { opacity: 0.15 } },
    ],
    layout: { name: "cose", animate: false, padding: 30 },
    wheelSensitivity: 0.2,
  });

  // Staleness is decided here, by the reader's clock (SPEC §4.2).
  function markStale(): void {
    const now = Date.now();
    cy.nodes().forEach((n: any) => {
      n.toggleClass("stale", isStale(text(n.data("stale_after")), now));
    });
  }
  markStale();

  cy.on("tap", "node", (event: any) => showDetail(event.target.data("concept")));
  cy.on("tap", (event: any) => {
    if (event.target === cy) clearSelection();
  });

  byId<HTMLSelectElement>("layout").addEventListener("change", (event) => {
    const layout = (event.target as HTMLSelectElement).value;
    cy.layout({ name: layout, animate: false, padding: 30 }).run();
  });

  byId("reset").addEventListener("click", () => {
    cy.fit(undefined, 30);
    clearSelection();
  });

  // Search and the filters combine: a node is dimmed unless it passes each.
  const searchInput = byId<HTMLInputElement>("search");
  function applyFilters(): void {
    const query = searchInput.value.trim().toLowerCase();
    const type = typeSelect.value;
    const bundle = bundleSelect.value;
    cy.nodes().forEach((n: any) => {
      const data = n.data() as Node & { concept: string };
      const haystack = `${data.label} ${data.concept} ${data.tags.join(" ")}`.toLowerCase();
      const shown =
        (query === "" || haystack.includes(query)) &&
        (type === "" || data.type === type) &&
        (bundle === "" || data.bundle === bundle);
      n.toggleClass("dim", !shown);
    });
    cy.edges().forEach((e: any) => {
      e.toggleClass("dim", e.source().hasClass("dim") || e.target().hasClass("dim"));
    });
  }
  searchInput.addEventListener("input", applyFilters);
  typeSelect.addEventListener("change", applyFilters);
  bundleSelect.addEventListener("change", applyFilters);

  function clearSelection(): void {
    cy.elements().unselect();
    byId("detail-empty").hidden = false;
    byId("detail-content").hidden = true;
  }

  function internalLink(id: string, label: string): HTMLAnchorElement {
    const a = element("a", label, "internal");
    a.href = "#";
    a.addEventListener("click", (event) => {
      event.preventDefault();
      showDetail(id);
    });
    return a;
  }

  function showDetail(id: string): void {
    const data = nodes.get(id);
    if (data === undefined) return;
    cy.elements().unselect();
    const node = cy.getElementById(cyIds.get(id));
    node.select();

    byId("detail-empty").hidden = true;
    byId("detail-content").hidden = false;

    const chip = byId("detail-type");
    chip.textContent = data.type;
    chip.style.background = data.color;

    byId("detail-title").textContent = data.label;
    byId("detail-id").textContent = id;
    const place = placeOf(id, data);
    byId("detail-bundle").textContent = place.bundleTitle;
    byId("detail-bundle").hidden = place.bundleTitle === "";
    byId("detail-description").textContent = data.description || "—";

    const resource = byId("detail-resource");
    if (data.resource === "") resource.textContent = "—";
    else if (isHttps(data.resource))
      resource.replaceChildren(externalLink(data.resource, data.resource));
    else resource.textContent = data.resource;

    const tags = byId("detail-tags");
    if (data.tags.length === 0) tags.textContent = "—";
    else tags.replaceChildren(...data.tags.map((tag) => element("span", tag, "tag")));

    // Signal badges: status, trust tier, staleness.
    const status = data.status || "stable";
    const badges = [
      element("span", status, STATUS_CLASSES.has(status) ? `badge status-${status}` : "badge"),
      element("span", data.trust_tier.replace(/-/g, " "), `badge trust-${data.trust_tier}`),
    ];
    const stale = isStale(data.stale_after, Date.now());
    node.toggleClass("stale", stale);
    if (stale) badges.push(element("span", `stale (since ${data.stale_after})`, "badge stale"));
    else if (data.stale_after !== "") {
      badges.push(element("span", `stale after ${data.stale_after}`, "badge fresh"));
    }
    byId("detail-badges").replaceChildren(...badges);

    byId("detail-generated").textContent = formatActorEvent(data.generated);
    byId("detail-verified").textContent =
      data.verified.length === 0 ? "—" : data.verified.map(formatActorEvent).join("; ");

    const sources = byId("detail-sources");
    if (data.sources.length === 0) {
      sources.textContent = "—";
    } else {
      const list = element("ul", "", "sources-list");
      for (const source of data.sources) {
        const target = text(source.resource);
        const label = text(source.title) || target || text(source.id) || "source";
        const item = document.createElement("li");
        // OKF §5.1: a source that is another concept is lineage, so it is
        // followed inside the viewer. Its path is tried from the concept's
        // directory, then from the bundle root, which is how OKF's own
        // bundles write it.
        const path = target.split("#")[0] as string;
        const concept =
          path === "" ? null : (place.resolve(path, place.dir) ?? place.resolve(path, ""));
        if (concept !== null) item.append(internalLink(concept, label));
        else if (isHttps(target)) item.append(externalLink(target, label));
        else item.textContent = target !== "" && target !== label ? `${label} (${target})` : label;
        list.append(item);
      }
      sources.replaceChildren(list);
    }

    byId("detail-body").replaceChildren(
      renderBody(bodies.get(id) ?? "", {
        conceptDir: place.dir,
        resolve: place.resolve,
        assetBase: place.imageBase,
      }),
    );

    const citing = backlinks.get(id) ?? [];
    byId("detail-backlinks").hidden = citing.length === 0;
    byId("backlinks-list").replaceChildren(
      ...citing.map((source) => {
        const item = document.createElement("li");
        item.append(
          internalLink(source, nodes.get(source)?.label ?? source),
          element("span", ` (${source})`, "muted"),
        );
        return item;
      }),
    );

    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.0) }, { duration: 200 });
  }

  // A link inside a rendered body names its concept in a data attribute.
  byId("detail-body").addEventListener("click", (event) => {
    const link = (event.target as Element).closest?.("a[data-concept]");
    if (link === null || link === undefined) return;
    event.preventDefault();
    showDetail(link.getAttribute("data-concept") as string);
  });

  // For embedding pages and tests: the graph, and a way to select a concept.
  (window as unknown as { okfViewer: unknown }).okfViewer = { cy, showDetail };

  // Show a first concept: a dataset if there is one, as in the reference.
  const initial = graph.nodes.find((n) => n.data.type === "BigQuery Dataset") ?? graph.nodes[0];
  if (initial !== undefined) showDetail(initial.data.id);
  else byId("detail-empty").textContent = "This bundle has no concepts.";
}

main();
