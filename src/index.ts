import "dotenv/config";
console.clear();

import { getData, parse, parseLinks, send } from "./functions";
import { Markup, Telegraf } from "telegraf";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

// ? [Jobs] ? //
import CheckerFile from "./jobs/Checker";
import MailerFile from "./jobs/Mailer";

const client = new Telegraf(process.env.BOT_TOKEN);
const prisma = new PrismaClient();
const temp: Record<number, number> = {};

const CheckerJob = CheckerFile(prisma, client);
const MailerJob = MailerFile(prisma, client);

export const whitelist = readFileSync("./whitelist.txt", "utf-8")
  .split(",")
  .map((id) => Number(id));

client.start(async (ctx) => {
  if (!whitelist.includes(ctx.from.id)) {
    await send(ctx, "☝️");
    return;
  }

  const data = await prisma.mailingUser.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!data) {
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback("Да", "action:enable_mail"),
      Markup.button.callback("Нет", "action:ignore_mail"),
    ]);

    const message = await ctx.reply(
      "Привет, вы хотите <b>подписаться</b> на рассылку для получения расписаний и его изменений?",
      {
        parse_mode: "HTML",
        reply_markup: keyboard.reply_markup,
      }
    );

    temp[ctx.from.id] = message.message_id;
    return true;
  }

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback("Да", "action:disable_mail"),
    Markup.button.callback("Нет", "action:continue_mail"),
  ]);

  const message = await ctx.reply(
    "Мне удалось найти вас в базе данных для рассылки\nВы хотите <b>отказаться</b> от рассылки?",
    {
      parse_mode: "HTML",
      reply_markup: keyboard.reply_markup,
    }
  );

  temp[ctx.from.id] = message.message_id;
  return true;
});

client.command("schedule", async (ctx) => {
  if (!whitelist.includes(ctx.from.id)) {
    await send(ctx, "☝️");
    return;
  }

  const data = await getData();
  if (!data) {
    return ctx.reply(
      "❌ <b>Произошла ошибка во время получения информации...</b>",
      {
        parse_mode: "HTML",
      }
    );
  }

  const html = data.childNodes[2];
  const body = html.childNodes[3];
  const divs = parse(body.childNodes);

  const container = parse(divs[1].childNodes);
  const row = parse(container)[0];
  const col = parse(row.childNodes)[0];

  const links = parseLinks(col.childNodes);
  const schedules = links.filter((l) => {
    return l.childNodes[0].outerHTML.includes("Расписание занятий на");
  });

  const schedule = schedules[0];
  const file_link = schedule.attributes.getValue("href");
  const ext = file_link.endsWith(".xlsx")
    ? "xlsx"
    : file_link.endsWith(".docx")
    ? "docx"
    : file_link.endsWith(".pdf")
    ? "pdf"
    : "";

  const name = schedule.childNodes[0].outerHTML.replaceAll(" ", "_").slice(22);
  const first_date = name.slice(0, 10).replaceAll("_", "").replaceAll(".", "-");
  const second_date = name.slice(12).replaceAll("_", "").replaceAll(".", "-");
  const filename = `${first_date}_${second_date}`;

  var errored = false;
  try {
    await ctx.sendDocument({
      url: file_link,
      filename: `${filename}.${ext}`,
    });
  } catch (error) {
    errored = true;
  }

  if (!errored) {
    var record = await prisma.lastRecord.findFirst({
      where: { user_id: ctx.from.id.toString() },
    });

    if (!record) return true;
    await prisma.lastRecord.update({
      data: {
        user_id: ctx.from.id.toString(),

        schedule: file_link,
        change: record.change,
      },

      where: {
        id: record.id,
      },
    });
  }

  return true;
});

client.command("changes", async (ctx) => {
  if (!whitelist.includes(ctx.from.id)) {
    await send(ctx, "☝️");
    return;
  }

  const data = await getData();
  if (!data) {
    await send(
      ctx,
      "❌ <b>Произошла ошибка во время получения информации...</b>"
    );

    return;
  }

  const html = data.childNodes[2];
  const body = html.childNodes[3];
  const divs = parse(body.childNodes);

  const container = parse(divs[1].childNodes);
  const row = parse(container)[0];
  const col = parse(row.childNodes)[0];

  const links = parseLinks(col.childNodes);
  const changes = links.filter((l) => {
    return l.childNodes[0].outerHTML.includes(
      "Изменения в расписании занятий на"
    );
  });

  const change = changes[0];
  const file_link = change.attributes.getValue("href");
  const ext = file_link.endsWith(".xlsx")
    ? "xlsx"
    : file_link.endsWith(".docx")
    ? "docx"
    : file_link.endsWith(".pdf")
    ? "pdf"
    : "";

  const name = change.childNodes[0].outerHTML
    .replaceAll(" ", "_")
    .slice(34)
    .replaceAll(".", "-");

  var errored = false;
  try {
    await ctx.sendDocument({
      url: file_link,
      filename: `${name}.${ext}`,
    });
  } catch (error) {
    errored = true;
  }

  if (!errored) {
    var record = await prisma.lastRecord.findFirst({
      where: { user_id: ctx.from.id.toString() },
    });

    if (!record) return true;
    await prisma.lastRecord.update({
      data: {
        user_id: ctx.from.id.toString(),

        schedule: record.schedule,
        change: file_link,
      },

      where: {
        id: record.id,
      },
    });
  }

  return true;
});

client.command("trigger", async (ctx) => {
  if (!whitelist.includes(ctx.from.id)) {
    await send(ctx, "❌ <b>Данная команда доступна только владельцу бота!</b>");
    return;
  }

  await CheckerJob.trigger();
  await MailerJob.trigger();

  await send(ctx, "✅ <b>Успех!</b>");
  return true;
});

client.command("stop", async (ctx) => {
  if (!whitelist.includes(ctx.from.id)) {
    await send(ctx, "❌ <b>Данная команда доступна только владельцу бота!</b>");
    return;
  }

  const data = await prisma.mailingUser.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!data) {
    await send(ctx, "❌ <b>Вы не подписывались на рассылку!</b>");
    return;
  }

  const record = await prisma.lastRecord.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  await prisma.mailingUser.delete({
    where: { id: data.id },
  });

  await prisma.lastRecord.delete({
    where: { id: record.id },
  });

  await send(
    ctx,
    "✅ <b>Вы успешно отписались от рассылки!</b>\n<b>Для повторной подписки воспользуйтесь командой /start</b>"
  );

  return true;
});

// ? [Actions] ? //
client.action("action:enable_mail", async (ctx) => {
  const data = await prisma.mailingUser.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!data) {
    await prisma.mailingUser.create({
      data: { user_id: ctx.from.id.toString() },
    });

    const record = await prisma.lastRecord.findFirst({
      where: { user_id: ctx.from.id.toString() },
    });

    if (!record) {
      await prisma.lastRecord.create({
        data: {
          user_id: ctx.from.id.toString(),

          schedule: "",
          change: "",
        },
      });
    }

    await send(ctx, "Вы <b>подписались</b> на рассылку!");
  } else {
    await send(ctx, "Вы уже <b>подписаны</b> на рассылку!");
  }

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]);
    temp[ctx.from.id] = null;
  }

  return true;
});

client.action("action:disable_mail", async (ctx) => {
  if (!whitelist.includes(ctx.from.id)) return;

  const data = await prisma.mailingUser.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!data) {
    await send(ctx, "❌ Вы <b>не подписывались</b> на рассылку!");
  } else {
    await prisma.mailingUser.delete({
      where: { id: data.id, user_id: ctx.from.id.toString() },
    });

    const record = await prisma.lastRecord.findFirst({
      where: { id: data.id, user_id: ctx.from.id.toString() },
    });

    if (record) {
      await prisma.lastRecord.delete({
        where: {
          id: record.id,
        },
      });
    }

    await send(ctx, "Вы <b>отказались</b> от рассылки!");
  }

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]).catch(() => {});
    temp[ctx.from.id] = null;
  }

  return true;
});

client.action("action:continue_mail", async (ctx) => {
  const record = await prisma.lastRecord.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!record) {
    await prisma.lastRecord.create({
      data: {
        user_id: ctx.from.id.toString(),

        schedule: "",
        change: "",
      },
    });
  }

  await send(ctx, "Вы <b>согласились</b> на дальнейшую рассылку!");

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]).catch(() => {});
    temp[ctx.from.id] = null;
  }

  return true;
});

client.action("action:ignore_mail", async (ctx) => {
  if (!whitelist.includes(ctx.from.id)) return;

  const record = await prisma.lastRecord.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!record) {
    await send(ctx, "Вы <b>отказались</b> от получения рассылки!");
  } else {
    await prisma.lastRecord.delete({
      where: {
        id: record.id,
      },
    });

    await send(ctx, "Вы <b>отказались</b> от получения рассылки!");
  }

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]).catch(() => {});
    temp[ctx.from.id] = null;
  }

  return true;
});

// ? [Processing] ? //
client.launch();
console.log("[#] Бот запущен!");

process.on("SIGINT", () => client.stop("SIGINT"));
process.on("SIGTERM", () => client.stop("SIGTERM"));
