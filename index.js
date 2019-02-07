require('dotenv').config();

const Airtable = require("airtable");
const moment = require("moment");
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const baseName = "appPLvQUWIL4UbPGi";

Airtable.configure({
  endpointUrl: "https://api.airtable.com",
  apiKey: airtableApiKey
});

const base = Airtable.base(baseName);
const fromTable = "Recurring";
const fromView = "Grid view";
const toTable = "TEST";
const today = moment().startOf("day");

console.log("Today is", today.format("YYYY-MM-DD"), ".");

function secondsSinceMidNight(datetimeOrUndefined) {
  if (datetimeOrUndefined) {
    const datetime = moment(datetimeOrUndefined);
    return datetime.diff(datetime.clone().startOf("day"), "seconds");
  } else {
    return null;
  }
}

base(fromTable).select({
  view: fromView
}).eachPage(function page(records, fetchNextPage) {
  records.forEach(function(record) {
    const startDate = moment(record.get("Start date")).startOf("day");
    const endDate = record.get("End date") && moment(record.get("End date")).startOf("day");
    const period = record.get("Period (days)");
    const startToTargetInDays = Math.ceil(Math.abs(startDate.diff(today, "days")) / period) * period;
    const dueDate = startDate.clone().add(startToTargetInDays, "days");
    const workStartInSeconds = secondsSinceMidNight(record.get("Work start"));
    const workStartDate = workStartInSeconds && dueDate.clone().add(workStartInSeconds, "seconds") || null;
    const workEndInSeconds  = secondsSinceMidNight(record.get("Work end"));
    const workEndDate = workEndInSeconds && dueDate.clone().add(workEndInSeconds, "seconds") || dueDate;
    const summary = record.get("Summary");
    const filterFormula = "AND({Summary} = '" + summary + "', DATETIME_FORMAT({Work end}) = '" + workEndDate.utc().format("YYYY-MM-DDTHH:mm:ss+00:00") + "')";

    console.log("Going through", summary, "...");

    if (endDate && endDate.isBefore(workEndDate)) {
      return;
    }

    console.log("Looking for existing record...");

    base(toTable).select({
      filterByFormula: filterFormula
    }).eachPage(function page(existing, _) {
      if (existing.length > 0) {
        console.log("Existing record found.");
        return;
      }

      console.log("Creating new record...");

      base(toTable).create({
        "Summary": summary,
        "Work start": workStartDate,
        "Work end": workEndDate,
        "Due": dueDate.format("YYYY-MM-DD"),
        "Notes": record.get("Notes"),
        "Project": record.get("Project"),
        "Group": "Recurring"
      }, function(err, record) {
        if (err) { console.error(err); return; }

        console.log("New record created.");
      });
    });
  });

  fetchNextPage();
}, function done(err) {
  if (err) { console.error(err); return; }
});
