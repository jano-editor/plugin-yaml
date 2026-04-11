import type {
  LanguagePlugin,
  PluginContext,
  KeyInfo,
  CompletionItem,
} from "@jano-editor/plugin-types";
import { parse, parseDocument } from "yaml";

const DEFAULT_TAB_SIZE = 2;

const keywords = ["true", "false", "null", "yes", "no", "on", "off"];

// common YAML keys for docker-compose and kubernetes
const dockerComposeKeys: CompletionItem[] = [
  { label: "version", kind: "property", detail: "compose" },
  { label: "services", kind: "property", detail: "compose" },
  { label: "volumes", kind: "property", detail: "compose" },
  { label: "networks", kind: "property", detail: "compose" },
  { label: "image", kind: "property", detail: "service" },
  { label: "build", kind: "property", detail: "service" },
  { label: "ports", kind: "property", detail: "service" },
  { label: "environment", kind: "property", detail: "service" },
  { label: "volumes", kind: "property", detail: "service" },
  { label: "depends_on", kind: "property", detail: "service" },
  { label: "restart", kind: "property", detail: "service" },
  { label: "command", kind: "property", detail: "service" },
  { label: "container_name", kind: "property", detail: "service" },
  { label: "networks", kind: "property", detail: "service" },
  { label: "labels", kind: "property", detail: "service" },
  { label: "healthcheck", kind: "property", detail: "service" },
  { label: "deploy", kind: "property", detail: "service" },
  { label: "logging", kind: "property", detail: "service" },
  { label: "env_file", kind: "property", detail: "service" },
  { label: "expose", kind: "property", detail: "service" },
];

const kubernetesKeys: CompletionItem[] = [
  { label: "apiVersion", kind: "property", detail: "k8s" },
  { label: "kind", kind: "property", detail: "k8s" },
  { label: "metadata", kind: "property", detail: "k8s" },
  { label: "spec", kind: "property", detail: "k8s" },
  { label: "name", kind: "property", detail: "meta" },
  { label: "namespace", kind: "property", detail: "meta" },
  { label: "labels", kind: "property", detail: "meta" },
  { label: "annotations", kind: "property", detail: "meta" },
  { label: "containers", kind: "property", detail: "spec" },
  { label: "replicas", kind: "property", detail: "spec" },
  { label: "selector", kind: "property", detail: "spec" },
  { label: "template", kind: "property", detail: "spec" },
  { label: "ports", kind: "property", detail: "container" },
  { label: "env", kind: "property", detail: "container" },
  { label: "resources", kind: "property", detail: "container" },
  { label: "volumeMounts", kind: "property", detail: "container" },
];

const yamlValues: Record<string, CompletionItem[]> = {
  restart: [
    { label: "always", kind: "constant" },
    { label: "unless-stopped", kind: "constant" },
    { label: "on-failure", kind: "constant" },
    { label: "no", kind: "constant" },
  ],
  kind: [
    { label: "Deployment", kind: "constant", detail: "k8s" },
    { label: "Service", kind: "constant", detail: "k8s" },
    { label: "ConfigMap", kind: "constant", detail: "k8s" },
    { label: "Secret", kind: "constant", detail: "k8s" },
    { label: "Pod", kind: "constant", detail: "k8s" },
    { label: "Ingress", kind: "constant", detail: "k8s" },
    { label: "StatefulSet", kind: "constant", detail: "k8s" },
    { label: "DaemonSet", kind: "constant", detail: "k8s" },
    { label: "Job", kind: "constant", detail: "k8s" },
    { label: "CronJob", kind: "constant", detail: "k8s" },
  ],
};

const plugin: LanguagePlugin = {
  name: "YAML",
  extensions: [".yml", ".yaml"],
  highlight: {
    keywords,
    patterns: {
      comment: /#.*$/gm,
      string: /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
      number: /\b\d+\.?\d*\b/g,
      type: /^[\w.-]+(?=\s*:)/gm,
      variable: /\$\{?\w+\}?/g,
    },
  },

  onKeyDown(key: KeyInfo, ctx: PluginContext) {
    // Ctrl+/ → toggle comment
    if (key.ctrl && key.name === "/") {
      const comment = "# ";
      const lines = [...ctx.lines];
      const affectedLines = new Set<number>();
      for (const c of ctx.cursors) {
        if (c.anchor) {
          const startY = Math.min(c.position.line, c.anchor.line);
          const endY = Math.max(c.position.line, c.anchor.line);
          for (let l = startY; l <= endY; l++) affectedLines.add(l);
        } else {
          affectedLines.add(c.position.line);
        }
      }
      const sorted = [...affectedLines].sort((a, b) => a - b);
      const allCommented = sorted.every((l) => lines[l].trimStart().startsWith("#"));
      for (const l of sorted) {
        if (allCommented) {
          const idx = lines[l].indexOf("#");
          const end = lines[l][idx + 1] === " " ? idx + 2 : idx + 1;
          lines[l] = lines[l].substring(0, idx) + lines[l].substring(end);
        } else {
          const m = lines[l].match(/^(\s*)/);
          const indent = m ? m[1].length : 0;
          lines[l] = lines[l].substring(0, indent) + comment + lines[l].substring(indent);
        }
      }
      return {
        handled: true,
        edit: { replaceAll: lines, cursors: ctx.cursors.map((c) => ({ ...c })) },
      };
    }
    return null;
  },

  onFormat(ctx: PluginContext) {
    const raw = ctx.lines.join("\n");
    try {
      const doc = parseDocument(raw);
      const formatted = doc.toString({ indent: ctx.settings.tabSize, lineWidth: 0 });
      return {
        replaceAll: formatted.split("\n"),
        cursors: [{ position: ctx.cursors[0].position, anchor: null }],
      };
    } catch {
      return null;
    }
  },

  onCursorAction(ctx: PluginContext) {
    if (!ctx.action || ctx.action.type !== "newline") return null;

    const cursor = ctx.action.cursor;
    const curLine = cursor.position.line;
    const prevLine = curLine > 0 ? ctx.lines[curLine - 1] : "";
    const match = prevLine.match(/^(\s*)/);
    let indent = match ? match[1] : "";

    if (/:\s*$/.test(prevLine)) {
      indent += " ".repeat(ctx.settings.tabSize);
    } else if (/^\s*-\s/.test(prevLine)) {
      // continue list, keep indent
    } else if (prevLine.trim() === "") {
      indent = "";
    }

    if (indent.length === 0) return null;

    return {
      edits: [
        {
          range: { start: { line: curLine, col: 0 }, end: { line: curLine, col: 0 } },
          text: indent,
        },
      ],
      cursors: [{ position: { line: curLine, col: indent.length }, anchor: null }],
    };
  },

  onComplete(ctx: PluginContext): CompletionItem[] | null {
    const cursor = ctx.cursors[0];
    if (!cursor) return null;

    const line = ctx.lines[cursor.position.line] ?? "";
    const col = cursor.position.col;

    // detect if we're after a key: (value position)
    const keyMatch = line.match(/^(\s*)([\w.-]+)\s*:\s*/);
    if (keyMatch && col >= keyMatch[0].length) {
      const key = keyMatch[2];
      if (yamlValues[key]) return yamlValues[key];
      // boolean values as fallback
      return keywords.map((k) => ({ label: k, kind: "constant" as const }));
    }

    // always offer all known keys — the editor filters by prefix
    const items: CompletionItem[] = [
      ...dockerComposeKeys,
      ...kubernetesKeys,
    ];

    // deduplicate (some keys appear in both lists)
    const seen = new Set<string>();
    const deduped: CompletionItem[] = [];
    for (const item of items) {
      if (!seen.has(item.label)) {
        seen.add(item.label);
        deduped.push(item);
      }
    }

    for (const kw of keywords) {
      if (!seen.has(kw)) {
        deduped.push({ label: kw, kind: "keyword" });
      }
    }

    return deduped;
  },

  onValidate(lines: readonly string[]) {
    const raw = lines.join("\n");
    try {
      parse(raw);
      return [];
    } catch (err: any) {
      const line = err.linePos?.[0]?.line ? err.linePos[0].line - 1 : 0;
      const col = err.linePos?.[0]?.col ? err.linePos[0].col - 1 : 0;
      const msg = err.message?.split("\n")[0] || "YAML syntax error";
      return [{ line, col, severity: "error" as const, message: msg }];
    }
  },
};

export default plugin;
