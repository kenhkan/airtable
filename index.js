console.time("wall-time");

require('dotenv').config();

const Airtable = require("airtable");
const moment = require('moment-timezone');
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const baseName = "appPLvQUWIL4UbPGi";

moment.tz.setDefault("America/New_York");
Airtable.configure({
  endpointUrl: "https://api.airtable.com",
  apiKey: airtableApiKey
});

const base = Airtable.base(baseName);
const fromTable = "Recurring";
const fromView = "Grid view";
const toTable = "Promises";
const today = moment().startOf("day");

var itemCount = 0;

console.log("Today is", today.format("YYYY-MM-DD"), ".");

function secondsSinceMidNight(datetimeOrUndefined) {
  if (datetimeOrUndefined) {
    const datetime = moment(datetimeOrUndefined);
    return datetime.diff(datetime.clone().startOf("day"), "seconds");
  } else {
    return null;
  }
}

function endOfProgram() {
  if (itemCount === 0) {
    console.timeEnd("wall-time");
  }
}

function goThroughRecord(record, periodCount) {
  const startDate = moment(record.get("Start date")).startOf("day");
  const endDate = record.get("End date") && moment(record.get("End date")).startOf("day");
  const period = record.get("Period (days)");
  const startToTargetInDays = Math.ceil(Math.abs(startDate.diff(today, "days")) / period) * period + period * periodCount;
  const dueDate = startDate.clone().add(startToTargetInDays, "days");
  const workStartInSeconds = secondsSinceMidNight(record.get("Work start"));
  const workStartDate = workStartInSeconds && dueDate.clone().add(workStartInSeconds, "seconds") || null;
  const workEndInSeconds  = secondsSinceMidNight(record.get("Work end"));
  const workEndDate = workEndInSeconds && dueDate.clone().add(workEndInSeconds, "seconds") || dueDate;
  const summary = record.get("Summary");
  const filterFormula = "AND({Summary} = '" + summary + "', DATETIME_FORMAT({Work end}) = '" + workEndDate.clone().utc().format("YYYY-MM-DDTHH:mm:ss+00:00") + "')";

  console.log("Looking at", summary, "with work end date of", workEndDate.format("YYYY-MM-DDTHH:mm:ss+00:00"));

  if (startDate && startDate.isAfter(today)) {
    console.log("Series not started.");
    return;
  }

  if (endDate && endDate.isBefore(workEndDate)) {
    console.log("Series ended.");
    return;
  }

  const itemId = itemCount++;

  console.log(itemId, "Looking for existing record...");

  base(toTable).select({
    filterByFormula: filterFormula
  }).eachPage(function page(existing, _) {
    if (existing.length > 0) {
      console.log(itemId, "Existing record found.");
      itemCount--;
      endOfProgram();
      return;
    }

    console.log(itemId, "Creating new record...");

    base(toTable).create({
      "Summary": summary,
      "Work start": workStartDate,
      "Work end": workEndDate,
      "Due": dueDate.format("YYYY-MM-DD"),
      "Notes": record.get("Notes"),
      "Project": record.get("Project"),
      "Grouping": "Recurring"
    }, function(err, record) {
      if (err) {
        console.error(err);
      } else {
        console.log(itemId, "New record created.");
      }

      itemCount--;
      endOfProgram();
    });
  });
}

base(fromTable).select({
  view: fromView
}).eachPage(function page(records, fetchNextPage) {
  records.forEach(function(record) {
    // Plan eight periods out
    for (var i = 0, l = 8; i < l; i++) {
      goThroughRecord(record, i);
    }
  });

  fetchNextPage();
}, function done(err) {
  if (err) {
    console.error(err);
  }

  endOfProgram();
});
