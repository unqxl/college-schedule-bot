import { downloadFile, getData, parse, parseLinks } from "./functions";
import { LastRecord, PrismaClient } from "@prisma/client";
import { HTMLElement } from "html-parser.ts";
import { existsSync } from "fs";
import { Telegraf } from "telegraf";
import Cron from "croner";

export = (prisma: PrismaClient, client: Telegraf) => {
  function sendSchedule(record: LastRecord, link: string) {
    if (record.schedule !== link) return true;
    else return false;
  }

  function sendChange(record: LastRecord, link: string) {
    if (record.change !== link) return true;
    else return false;
  }

  function parseSchedules(data: HTMLElement[]) {
    return data.filter((l) => {
      return l.childNodes[0].outerHTML.includes("Расписание занятий на");
    });
  }

  function parseChanges(data: HTMLElement[]) {
    return data.filter((l) => {
      return l.childNodes[0].outerHTML.includes(
        "Изменения в расписании занятий на"
      );
    });
  }

  console.log("[#] Job Started");
  return Cron("0 0 */1 * * *", { timezone: "Europe/Moscow" }, async () => {
    const users = await prisma.mailingUser.findMany();
    const data = await getData();

    const html = data.childNodes[2];
    const body = html.childNodes[3];
    const divs = parse(body.childNodes);

    const container = parse(divs[1].childNodes);
    const row = parse(container)[0];
    const col = parse(row.childNodes)[0];

    const links = parseLinks(col.childNodes);
    const schedules = parseSchedules(links);
    const changes = parseChanges(links);

    for (const user of users) {
      const schedule = schedules[0];
      const schedule_link = schedule.attributes.getValue("href");
      const schedule_index = links.findIndex(
        (c) => c.childNodes[0].outerHTML === schedule.childNodes[0].outerHTML
      );

      const change = changes[0];
      const change_link = change.attributes.getValue("href");
      const change_index = links.findIndex(
        (c) => c.childNodes[0].outerHTML === change.childNodes[0].outerHTML
      );

      const record = await prisma.lastRecord.findFirst({
        where: { user_id: user.user_id },
      });

      if (!record) continue;
      else {
        if (sendSchedule(record, schedule_link)) {
          const name = schedule.childNodes[0].outerHTML.replaceAll(" ", "_");
          if (existsSync(`./cache/${name}.xlsx`)) {
            await client.telegram.sendDocument(user.user_id, {
              source: `./cache/${name}.xlsx`,
              filename: `${name}.xslx`,
            });
          } else {
            downloadFile(schedule_link, name, "xlsx").then(async () => {
              await client.telegram.sendDocument(user.user_id, {
                source: `./cache/${name}.xlsx`,
                filename: `${name}.xslx`,
              });

              return true;
            });
          }

          await prisma.lastRecord.update({
            data: {
              schedule: schedule_link,
              change: record.change,
            },

            where: {
              id: record.id,
            },
          });
        }

        if (sendChange(record, change_link) && change_index < schedule_index) {
          const name = change.childNodes[0].outerHTML.replaceAll(" ", "_");
          if (existsSync(`./cache/${name}.pdf`)) {
            await client.telegram.sendDocument(user.user_id, {
              source: `./cache/${name}.pdf`,
              filename: `${name}.pdf`,
            });
          } else {
            downloadFile(change_link, name, "pdf").then(async () => {
              await client.telegram.sendDocument(user.user_id, {
                source: `./cache/${name}.pdf`,
                filename: `${name}.pdf`,
              });
            });
          }

          await prisma.lastRecord.update({
            data: {
              user_id: user.user_id,

              schedule: schedule_link,
              change: change_link,
            },

            where: {
              id: record.id,
            },
          });
        }
      }
    }
  });
};
