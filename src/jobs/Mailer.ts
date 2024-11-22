import { getData, parse, parseLinks } from "../functions";
import { LastRecord, PrismaClient } from "@prisma/client";
import { HTMLElement } from "html-parser.ts";
import { whitelist } from "..";
import { Telegraf } from "telegraf";
import Cron from "croner";

// ? [Senders] ? //
const shouldSend = (record: LastRecord, column: string, link: string) =>
  record[column] !== link;

// ? [Parsers] ? //
const parseSchedules = (data: HTMLElement[]) =>
  data.filter((l) => {
    return l.childNodes[0].outerHTML.includes("Расписание занятий на");
  });

const parseChanges = (data: HTMLElement[]) =>
  data.filter((l) => {
    return l.childNodes[0].outerHTML.includes(
      "Изменения в расписании занятий на"
    );
  });

export = (prisma: PrismaClient, client: Telegraf) => {
  console.log("[#] Mailer Job Started");
  return Cron("0 */30 * * * *", { timezone: "Europe/Moscow" }, async () => {
    const users = await prisma.mailingUser.findMany();
    const data = await getData();
    if (!data) return;

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
      if (!whitelist.includes(Number(user.user_id))) continue;

      const record = await prisma.lastRecord.findFirst({
        where: { user_id: user.user_id },
      });

      if (!record) continue;

      var schedule_index = -1;
      var schedule_link = "-";

      if (schedules.length) {
        const schedule = schedules[0];
        schedule_link = schedule.attributes.getValue("href");
        schedule_index = links.findIndex(
          (c) => c.childNodes[0].outerHTML === schedule.childNodes[0].outerHTML
        );

        if (shouldSend(record, "schedule", schedule_link)) {
          const name = schedule.childNodes[0].outerHTML
            .replaceAll(" ", "_")
            .slice(22);

          const first_date = name
            .slice(0, 10)
            .replaceAll("_", "")
            .replaceAll(".", "-");

          const second_date = name
            .slice(12)
            .replaceAll("_", "")
            .replaceAll(".", "-");

          const filename = `${first_date}_${second_date}`;

          var errored = false;
          try {
            await client.telegram.sendDocument(user.user_id, {
              url: schedule_link,
              filename: `${filename}.xlsx`,
            });
          } catch (error) {
            errored = true;
          }

          if (!errored) {
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
        }
      }

      if (changes.length) {
        const change = changes[0];
        const change_link = change.attributes.getValue("href");
        const change_index = links.findIndex(
          (c) => c.childNodes[0].outerHTML === change.childNodes[0].outerHTML
        );

        if (shouldSend(record, "change", change_link)) {
          const name = change.childNodes[0].outerHTML
            .replaceAll(" ", "_")
            .slice(34)
            .replaceAll(".", "-");

          var errored = false;
          try {
            await client.telegram.sendDocument(user.user_id, {
              url: change_link,
              filename: `${name}.pdf`,
            });
          } catch (error) {
            errored = true;
          }

          if (!errored) {
            var to_update = {
              user_id: user.user_id,
              change: change_link,
            };

            if (schedule_link !== "-") {
              to_update["schedule"] = schedule_link;
            }

            await prisma.lastRecord.update({
              data: to_update,
              where: {
                id: record.id,
              },
            });
          }
          schedule_index !== -1 && change_index < schedule_index;
        }
      }
    }
  });
};
