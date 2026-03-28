import type { LanguagePlugin, PluginContext, KeyInfo } from "@jano-editor/plugin-types";
import { parse, parseDocument } from "yaml";

const TAB_SIZE = 2;

const keywords = ["true", "false", "null", "yes", "no", "on", "off"];

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
      const formatted = doc.toString({ indent: TAB_SIZE, lineWidth: 0 });
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
      indent += " ".repeat(TAB_SIZE);
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
