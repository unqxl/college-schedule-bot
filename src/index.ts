import "dotenv/config";
console.clear();

import { downloadFile, getData, parse, parseLinks } from "./functions";
import { Markup, Telegraf } from "telegraf";
import { LastRecord, MailingUser, PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import JobFile from "./job";

const client = new Telegraf(process.env.BOT_TOKEN);
const prisma = new PrismaClient();

const temp: Record<number, number> = {};
const job = JobFile(prisma, client);

client.start(async (ctx) => {
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

  const name = schedule.childNodes[0].outerHTML.replaceAll(" ", "_");
  if (existsSync(`./cache/${name}.xlsx`)) {
    await ctx.sendDocument({
      source: `./cache/${name}.xlsx`,
      filename: `${name}.xlsx`,
    });
  } else {
    downloadFile(file_link, name, "xlsx").then(async () => {
      await ctx.sendDocument({
        source: `./cache/${name}.xlsx`,
        filename: `${name}.xlsx`,
      });

      return true;
    });
  }

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

  return true;
});

client.command("changes", async (ctx) => {
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
    return l.childNodes[0].outerHTML.includes(
      "Изменения в расписании занятий на"
    );
  });

  const schedule = schedules[0];
  const file_link = schedule.attributes.getValue("href");

  const name = schedule.childNodes[0].outerHTML.replaceAll(" ", "_");
  if (existsSync(`./cache/${name}.pdf`)) {
    await ctx.sendDocument({
      source: `./cache/${name}.pdf`,
      filename: `${name}.xlsx`,
    });
  } else {
    downloadFile(file_link, name, "pdf").then(async () => {
      await ctx.sendDocument({
        source: `./cache/${name}.pdf`,
        filename: `${name}.pdf`,
      });

      return true;
    });
  }

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

  return true;
});

client.command("trigger", async (ctx) => {
  if (ctx.from.id !== 718443203) {
    return ctx.reply(
      "❌ <b>Данная команда доступна только владельцу бота!</b>",
      {
        parse_mode: "HTML",
      }
    );
  }

  await job.trigger();
  await ctx.reply("✅ <b>Успех!</b>", {
    parse_mode: "HTML",
  });

  return true;
});

client.command("stop", async (ctx) => {
  const data = await prisma.mailingUser.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!data) {
    await ctx.reply("❌ <b>Вы не подписывались на рассылку!</b>", {
      parse_mode: "HTML",
    });

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

  await ctx.reply(
    "✅ <b>Вы успешно отписались от рассылки!</b>\n<b>Для повторной подписки воспользуйтесь командой /start</b>",
    {
      parse_mode: "HTML",
    }
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

    await ctx.reply("Вы <b>подписались</b> на рассылку!", {
      parse_mode: "HTML",
    });

    if (temp[ctx.from.id]) {
      await ctx.deleteMessage(temp[ctx.from.id]);
      temp[ctx.from.id] = null;
    }

    return true;
  }

  await ctx.reply("Вы уже <b>подписаны</b> на рассылку!", {
    parse_mode: "HTML",
  });

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]);
    temp[ctx.from.id] = null;
  }

  return true;
});

client.action("action:disable_mail", async (ctx) => {
  const data = await prisma.mailingUser.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!data) {
    await ctx.reply("❌ Вы <b>не подписывались</b> на рассылку!", {
      parse_mode: "HTML",
    });

    if (temp[ctx.from.id]) {
      await ctx.deleteMessage(temp[ctx.from.id]);
      temp[ctx.from.id] = null;
    }

    return true;
  }

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

  await ctx.reply("Вы успешно <b>отказались</b> от рассылки!", {
    parse_mode: "HTML",
  });

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]);
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

  await ctx.reply("Вы успешно <b>согласились</b> на дальнейшую рассылку!", {
    parse_mode: "HTML",
  });

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]);
    temp[ctx.from.id] = null;
  }

  return true;
});

client.action("action:ignore_mail", async (ctx) => {
  const record = await prisma.lastRecord.findFirst({
    where: { user_id: ctx.from.id.toString() },
  });

  if (!record) {
    await ctx.reply("Вы <b>отказались</b> на получение рассылки!", {
      parse_mode: "HTML",
    });

    if (temp[ctx.from.id]) {
      await ctx.deleteMessage(temp[ctx.from.id]);
      temp[ctx.from.id] = null;
    }

    return true;
  }

  await prisma.lastRecord.delete({
    where: {
      id: record.id,
    },
  });

  await ctx.reply("Вы <b>отказались</b> от получения рассылки!", {
    parse_mode: "HTML",
  });

  if (temp[ctx.from.id]) {
    await ctx.deleteMessage(temp[ctx.from.id]);
    temp[ctx.from.id] = null;
  }

  return true;
});

// ? [Processing] ? //
client.launch().then(() => console.log("[#] Бот запущен!"));

process.once("SIGINT", () => client.stop("SIGINT"));
process.once("SIGTERM", () => client.stop("SIGTERM"));
