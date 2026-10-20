// Settings. Change one of these, then deploy a new version.
var CLUB_NAME = 'Second Chapter';
var MEETING_WEEKDAY = 4; // Thursday
var MEETING_HOUR = 19;
var MEETING_TIME = '19:00';
var VENUE = "Hartley's, a café";
var MAX_MEMBERS = 12;

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CLUB_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function clubCode_() {
  return String(sheet_('Settings').getRange('B1').getValue()).trim();
}

function checkCode_(code) {
  if (String(code).trim() !== clubCode_()) throw new Error('That code is not right.');
}

// Columns are found by their heading, so renaming or moving one in the sheet
// does not break the page as long as the heading keeps its key word.
var COLUMNS = { name: 'name', email: 'email', joined: 'joined' };

function getMembers() {
  var rows = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getValues();
  var headings = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var at = {};
  Object.keys(COLUMNS).forEach(function (key) {
    var i = headings.findIndex(function (h) { return h.indexOf(COLUMNS[key]) !== -1; });
    if (i === -1) {
      throw new Error("Couldn't find a column for " + key + '. The headings are: ' + rows[0].join(', '));
    }
    at[key] = i;
  });
  return rows.slice(1)
    .filter(function (row) { return String(row[at.name]).trim() !== ''; })
    .map(function (row) {
      return { name: String(row[at.name]).trim(), email: String(row[at.email]).trim(), joined: row[at.joined] };
    });
}

function firstThursday(year, month) {
  var d = new Date(year, month, 1, MEETING_HOUR, 0, 0);
  while (d.getDay() !== MEETING_WEEKDAY) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Built at the meeting's own hour, not midnight, so a time zone slip can never
// move it into another day.
function nextMeeting() {
  var now = new Date();
  var d = firstThursday(now.getFullYear(), now.getMonth());
  if (d < now) d = firstThursday(now.getFullYear(), now.getMonth() + 1);
  return d;
}

function meetingId_(date) {
  return Utilities.formatDate(date, 'Europe/London', 'yyyy-MM-dd');
}

function getPage(code) {
  checkCode_(code);
  var members = getMembers();
  var meeting = nextMeeting();
  return {
    club: CLUB_NAME,
    members: members.map(function (m) { return m.name; }),
    meeting: {
      id: meetingId_(meeting),
      when: Utilities.formatDate(meeting, 'Europe/London', 'EEEE d MMMM') + ', ' + MEETING_TIME,
      where: VENUE,
    },
    taken: members.length,
    max: MAX_MEMBERS,
    rsvps: rsvpsFor_(meetingId_(meeting)),
  };
}

function rsvpsFor_(meetingId) {
  var out = {};
  sheet_('RSVPs').getDataRange().getValues().slice(1).forEach(function (row) {
    if (row[0] === meetingId) out[row[1]] = row[2];
  });
  return out;
}

// One row per member per meeting: answering again replaces the old answer.
function setRsvp(code, meetingId, member, answer) {
  checkCode_(code);
  if (answer !== "I'm in" && answer !== 'Not this time') throw new Error('Unknown answer.');
  var tab = sheet_('RSVPs');
  var rows = tab.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === meetingId && rows[i][1] === member) {
      tab.getRange(i + 1, 3, 1, 2).setValues([[answer, new Date()]]);
      return rsvpsFor_(meetingId);
    }
  }
  tab.appendRow([meetingId, member, answer, new Date()]);
  return rsvpsFor_(meetingId);
}

// Runs every morning from a time-driven trigger, and only sends on the day
// before a meeting. The Reminded tab stops a second run sending twice.
function sendReminders() {
  var meeting = nextMeeting();
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (meetingId_(meeting) !== meetingId_(tomorrow)) return;
  var id = meetingId_(meeting);
  var reminded = sheet_('Reminded');
  var done = reminded.getDataRange().getValues().some(function (row) { return row[0] === id; });
  if (done) return;

  var going = rsvpsFor_(id);
  getMembers().forEach(function (m) {
    if (going[m.name] !== "I'm in" || !m.email) return;
    MailApp.sendEmail(
      m.email,
      CLUB_NAME + ' tomorrow',
      'See you tomorrow at ' + MEETING_TIME + ' at ' + VENUE + '.\n\n' + ScriptApp.getService().getUrl()
    );
  });
  reminded.appendRow([id, new Date()]);
}
