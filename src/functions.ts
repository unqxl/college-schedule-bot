import { HTMLElement, Node, parseHtmlDocument } from "html-parser.ts";
import { Context } from "telegraf";
import Axios from "axios";

export async function getData() {
  var result;
  try {
    result = await Axios.get(process.env.SCHEDULE_URL);
  } catch (error) {
    return null;
  }

  const document = parseHtmlDocument(result.data);
  return document;
}

export function parse(nodes: Node[]): HTMLElement[] {
  return nodes.filter(
    (n) => n instanceof HTMLElement && !["br", "script"].includes(n.tagName)
  ) as HTMLElement[];
}

export function parseLinks(nodes: Node[]): HTMLElement[] {
  return nodes.filter(
    (n) => n instanceof HTMLElement && n.tagName === "a"
  ) as HTMLElement[];
}

export async function send(ctx: Context, text: string) {
  return await ctx
    .reply(text, {
      parse_mode: "HTML",
    })
    .catch(() => {});
}
