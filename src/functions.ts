import { HTMLElement, Node, parseHtmlDocument } from "html-parser.ts";
import Axios from "axios";
import https from "node:https";
import fs from "node:fs";

export async function downloadFile(url: string, filename: string, ext: string) {
  return new Promise<boolean>((resolve) => {
    https.get(url, (res) => {
      const file = fs.createWriteStream(`./cache/${filename}.${ext}`);
      res.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve(true);
      });
    });
  });
}

export async function getData() {
  const result = await Axios.get(process.env.SCHEDULE_URL);
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
