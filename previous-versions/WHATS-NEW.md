# CaseVault: What's New, Version by Version

The day-to-day notes for each earlier version, newest first (moved here from [docs/USING-CASEVAULT.md](../docs/USING-CASEVAULT.md), which keeps the latest few). The feature summary for each version is in [README.md](README.md).

Some notes describe things later versions changed or removed (the Quick Links bar, the sidebar's Closed and Archived area, "Vault" before it became Settings).

## What's new in v1.186

- **Summaries.** The Weekly Summary and Year Summary tiles on the home page are now one **Summaries** tile. Click it and choose:
  - **Week:** what changed on each case in a week, and what was on its Timeline
  - **Year:** cases opened, closed and archived, arrests, charges and narcotics recovered

  Both still print as a PDF, and Find still opens either one by name
- **Narrative Helper** (new home page tile, and in Find). Write, paste and polish a narrative with the AI without opening a case first:
  - **Facts From a Case** (optional): choose a case and the AI may use its details, timeline, notes, arrest report and evidence
  - **Facts and Notes** (optional): type or paste the facts, and the AI uses them the same way
  - **Write a Draft:** the AI writes the narrative from those facts. **Ask AI to Edit:** tell it what to do with the selected text or the whole narrative. You see its version first, and Undo puts the text back
  - Anything the facts don't have is marked [CONFIRM: …]
  - **Open a Report** brings in a report from the chosen case. **Save to a Case** saves the narrative in a case's Reports, as a new report or over the one you opened
  - **Copy** and **Start Over**. Nothing is kept on this PC: the text stays in the window until you save it to a case or close CaseVault

## What's new in v1.185

- **Faster on a second run.** The passage-search model works out each passage of a case once, and CaseVault now keeps the result on the SSD (CaseVault-Data\ai-cache). Checks, Ask AI's file search, Draft with AI and Search All Cases skip the work the next time; on a PC without a graphics card that is most of the wait.
  - Only a fingerprint of each passage and its numbers are kept, never the text
  - The AI engine window shows how much is kept, with **Empty It**
- **Test the Models on This PC** (AI engine window). Each installed model reads the self-test's made-up affidavit and report and rewrites a short paragraph. You see:
  - how many of the 5 planted mistakes it finds, and any false alarms
  - whether it makes facts up
  - how fast it is

  The best for this PC is at the top. **Use This One** makes it this PC's model. Your cases are never used

## What's new in v1.184

- **Ask AI about a whole Mission.** In Ask AI's Case list, choose a Mission. Every case number goes with your question: details, timeline, notes, arrest report, the suspects' outcomes and all the buys. Ask "how many buys from John Doe, and what was paid?" or "which case numbers have no lab result?"
- **Timeline events from a report.** On the Timeline tab, **From a Report** reads one of the case's files, or text you paste, and lists its dated events: buys (with the drug, amount and price), arrests, court dates and others. Tick the ones to add.
  - An event already on the Timeline starts unticked
  - One whose sentence isn't in the report word for word is marked to check
  - Each event added keeps its sentence in its note
- **Search All Cases** (home page and ⋮ menu). Search every open case in plain words, for example "white Impala", "teardrop tattoo" or "buys near Example Park". It covers details, suspects, timelines, notes and reports.
  - Terminology counts too: "cocaine" also finds "snowball"
  - With a passage-search model, the closest in meaning come first
  - Click a result to open its case
- **Closing Summary** (Mission page). A short memo drafted by the AI from the Closeout's facts, for a supervisor or prosecutor. Facts the Mission doesn't have are checked again and marked [CONFIRM: …]. Edit it, then **Save to the Mission Folder** as Word, or **Copy**

## What's new in v1.183

- **Terminology** (Vault → Terminology). Words of the trade and what they mean: drug and quantity slang, abbreviations, your statutes, local places.
  - A short list of general terms is built in, and you can add your own
  - Only the terms a case uses go to the AI with it: Ask AI, Draft with AI, Ask AI to Edit
  - Drug slang marked **Same as** a drug also counts as that drug in the consistency checks, Case Health and Smart Paste, so "snowball" in one report and "cocaine" in another are the same drug
- **Language Bank** (Vault → Language Bank). Your approved paragraphs for each kind of warrant and subpoena: residence, vehicle, phone or electronic data, person or DNA, GPS, pen register, anticipatory and arrest warrants, and phone, bank, utility or other records subpoenas.
  - In Draft with AI, an Affidavit or Subpoena asks for its **Kind**. Your paragraphs for it are used word for word where they fit, and the AI is told the kind's required elements
  - A draft that doesn't seem to cover one is flagged, and **Review** lists them. The check looks for the usual words only
  - CaseVault ships no legal wording: the bank starts empty
- **Names stay out of the AI's examples.** Library examples are scrubbed of names, phone numbers and addresses before the AI reads them, even ones kept "as they are". Past the first example, only the paragraphs closest to the draft are sent
- **Ask AI and Ask AI to Edit use the Library too.** They get your "always" directives and the example passages closest to the question
- **Teach the AI with your final version.** Exporting a report that started as an AI draft offers **Use as AI Example**, once per report

## What's new in v1.182

- **Ask AI marks what the case doesn't say.** Under an answer about a case, any date, time, amount, weight or name it gives that isn't in the case material is listed, to check before relying on it
- **A second look at the facts.** After Draft with AI and Ask AI to Edit write, anything they added that the case doesn't have is sent back to the AI once to correct. What still isn't in the case becomes [CONFIRM: …]
  - Draft with AI: **Check its facts afterwards** (on by default). **Show the First Version** in the message puts its version from before the second look back
  - Ask AI to Edit: **Use Its First Version**
- **One part at a time.** Draft with AI can write a DEA-6 as Synopsis, then Details, then Indexing; an Affidavit, a Case Summary or a Supplemental Report also goes in parts. Each part knows what is already written. It is slower but much better with small models, and is on by default when the model is small

## What's new in v1.181

- **Ask AI to Edit.** A box to tell the AI what to do with a narrative. It's in the Reports editor (beside Re-phrase) and on the Write Report tab, above the Summary of Investigation:
  - Select a sentence or paragraph, or nothing for the whole narrative, then type what you want. For example "Make this more concise", "Add the time and place of the March 14 buy", "Write a paragraph about the arrest from the arrest report", or "Grammar only"
  - The AI uses this case's details, timeline (with each buy's drug, amount and price), notes, arrest report and evidence for any fact it adds. Where the case doesn't say, it writes [CONFIRM: …]
  - Its version shows beside your text. Nothing changes until you pick **Replace** or **Insert Below**, and **Undo** puts the text back
  - Dates, times, amounts, weights and names in its version that are in neither the case nor your text are marked, to check before you use it
  - Quick buttons: Tighten, Third Person Past Tense, Add Times and Places, Time Order, Grammar Only. **Keep as a Button** saves your own prompt (on the SSD)

## What's new in v1.180

- **Close Mission, each case number its own way.** Close Mission lists every open case number with its own disposition, suggested from its arrest report or what became of its suspect:
  - Arrested: Cleared by arrest
  - Not prosecuted: Exceptionally cleared (Prosecution declined)
  - Deceased: Exceptionally cleared (Death of the offender)
  - Moved to another case: Continued in another case

  Change any of them, untick one to leave it open, and close them all at once. The Write Report tab of each gets its own Status and How Cleared
- **Every case number's loose ends.** Close Mission lists the open deadlines, check flags, [CONFIRM: …] and evidence items of every case number, grouped by case number, not just the first one's
- **Mission Closeout PDF.** On the Mission page, **Closeout PDF** puts the Mission on one page: each case number with its disposition and close date, what became of each suspect with their charges, the buys by suspect with the total paid, and where the evidence stands. **Save to the Mission Folder** keeps it under Other
- **Following up on someone still at large.** Continue in a New Case asks for the warrant number and adds a **Warrant check** deadline to the new case's Timeline (30 days by default). When that case later closes by arrest, CaseVault offers to note it on the closed Mission ("Later: … arrested on case …") and on the Timeline of the case it came from. The Mission stays closed
- **Undo for Continue in a New Case.** Next to "Continued in case …" on the suspect's card. It removes the new case (to Recently Deleted) and makes the suspect At Large again, but only while nothing was added to the new case
- **Archive Case Numbers** on a closed Mission's page moves its closed case numbers to the archive together, with one reason. A case carried on elsewhere is not touched

## What's new in v1.179

- **What became of each suspect.** Each suspect on the Details tab has an **Outcome**: At Large, Arrested, Not Prosecuted or Deceased. In a Mission it is the same on every case number, like the suspects. A suspect named on an arrest report of the case (or of the Mission) counts as Arrested until you choose otherwise
- **Continue in a New Case.** A suspect still At Large shows this button. It makes an independent case in General Files, outside the Mission, for that person:
  - Their details, record numbers and description come along, and so do the case's contacts
  - Each case points to the other: the new case's Details tab says where it came from, and the suspect's card says "Continued in case …" with a link
  - Both Timelines get an entry saying so
  - The suspect becomes **Moved to Another Case**, so the Mission can close while the new case stays open
- **Closing a Mission with someone still at large.** Close Case and Close Mission remind you of anyone still At Large, and Close Mission lists every suspect's outcome. There is a new disposition, **Continued in another case**, for a case number whose suspect was carried on elsewhere. The Mission keeps what became of its suspects when it closes, and its page shows it
- **The Mission page** shows how many suspects are accounted for, with each one's outcome

## What's new in v1.178

- **Security fixes (helper 1.17).** Update the CV-AI drive (W:) too: the helper changed
- **The right vault, always.** The helper opens the vault on the drive labelled CASEVAULT before any other drive with a vault (an old SSD, a copy, a USB stick). If no drive has that label, it uses another drive's vault and its window says so. It then stays with the vault it opened first, recognised by its vault ID and the drive's serial number:
  - If the SSD drops out, CaseVault shows "Drive not connected" instead of using another drive
  - The same SSD back under another drive letter is fine
  - An older vault is given a vault ID the first time this version opens it
- **No empty files from a bad upload.** The helper refuses a file whose size is missing, negative or not a number, one over 32 GB, and one sent in chunks, before anything on the SSD is touched
- **An installed Ollama keeps the AI off.** If an Ollama installed on the PC is running instead of the one on W: (it keeps its logs and models on the PC), the header shows **AI: installed Ollama (logs on this PC)**. The AI stays off until you click it and allow it for this session. Rules-only checks still work. Quit it from the tray and start CaseVault again to use the SSD's
- **Power Off closes only CaseVault's own window**, never another tab or window that mentions CaseVault (a GitHub page, for example). A browser window with other tabs open stays; close it yourself
- **The helper's key** is removed from the browser when the helper no longer accepts it, and at Power Off
- **The SSD copy every day.** Start CaseVault with Start-CaseVault.bat in any browser. The online copy on GitHub Pages shares its web address with the account's other Pages sites, so it no longer remembers the vault folder: choose it each visit and pick *Allow this time*. Its welcome screen says so. See [SECURITY.md](SECURITY.md)

## What's new in v1.177

- **Easier to read.** Text is now in Windows' own font (Segoe UI). Case numbers, codes, dates on the Timeline and counts stay in the monospace font, so they line up. Nothing extra is loaded
- **One heading style.** Section headings are in normal Title Case instead of spaced capitals. The folders in the case list (MISSIONS, GENERAL FILES, CLOSED) keep their capitals
- **The case header on one line:** the case number, the subject, where it is and its status
- **Timeline:**
  - When a case has events, the form folds away behind **Add Event**, so the events are what you see first. An empty timeline still opens with the form, and Edit on an event opens it
  - The four count cards hide while the timeline is empty
- **Write Report:** the part bars are shorter and closer together, and each shows how much is filled in (e.g. *Offense · 5 of 9 filled*). The green check still shows when a part is complete
- **Nothing hides under the round buttons** at the bottom right: every page has room below its last box
- **Fewer icons:** small secondary buttons show just their words. Main buttons, tabs, home tiles and headings keep their icons
- **The status icons at the top say what they are:** Offline, AI / AI Off, Memory, Saved, Off. They hide the words on a phone-width window
- **The Mail tab is off until you turn it on:** Settings → Department Mail → *Show the Mail tab on cases*
- **Smaller updates:** the notes of every earlier version (`previous-versions`) stay on GitHub and are no longer copied to the SSD

## What's new in v1.176

- **One name for each thing.** *Operation* is now **Mission** everywhere, and *Independent* is now **General Files** everywhere (case list, home page, dialogs and help)
- **Clearer names:**
  - The *Draft* tab is now **Write Report**, the *Reports* tab is **Saved Reports**, and *Send Draft to Reports* is **Save as Report**
  - *Send Back to Draft* is now **Back to Write Report**
  - *Move File* is now **Move Case**, since it moves the case
  - *See DEA 6* is now **Use DEA-6 Narrative**
  - The *BETA* tag is gone from Checks
- **Fewer duplicates:**
  - The home page has 7 tiles: New Case, Reference, Suspect Search, Rolodex, Calendar, Weekly Summary, Year Summary
  - Draft, Discovery and Link Chart only asked which case to open, so they are gone; open the case instead
  - Quick Links is in the case list and the menu, and Settings is in the menu
  - The Mission page no longer repeats its number, name and status in five boxes. Its dates show on one line, and its case table is headed **Case Numbers**
  - The Details tab drops the status hint and the folder line (both are now hover boxes)
- **Tidier case list:** *Order of the cases* and *Select Cases* moved into a **⋮** menu at the top of the case list
- **Shorter wording:** about 15 long placeholders and 18 long hover boxes were cut to a few words each (e.g. *Write here. [CONFIRM: …] marks facts to check.*)

## What's new in v1.175

- **Fix: the person window had scroll bars.** *Every case this person is on* now opens wide enough to show everything, with no scroll bars. Long text wraps instead of running off the side
- **Fix: the case list's padlock went to a second line.** The buttons at the top of the case list now stay on one line, padlock included. That width is also the narrowest the list can be dragged to
- **Fix: typing a full code hid the choice.** In IUCR, Location Code and other lists, typing the whole code (e.g. *259*) now still shows its match. Pick it, or press Enter, to fill in its description (e.g. *Type of Location*)
- **Fix: the cursor disappeared in the Officer's Report lines.** Clicking *Operation / Mission Number* (or any line with an Include box) sometimes ticked or unticked that box and took the cursor away. Clicking the box now always puts the cursor in it, and clicking the line's name does too
- **Suspect Search** (home page and Ctrl+K): find anyone on your cases, closed ones too, by name, date of birth or IR number. Each person is listed with DOB, gender, IR, case numbers, number of arrests and what they were arrested for. Pick one to open their profile:
  - What is known of them: date of birth and age, gender, race, IR and CB numbers
  - Icons for **Narcotics**, **Battery** and **Firearms** arrests, worked out from the charges' statutes and wording
  - Every case they are on, with its arrests
  - **Arrest Reports**: each arrest with its date, charges (each with its icon) and location. A button opens the Arrest tab, and any *Arrest Report* PDF in the case's Files opens from there too
  - **Police Interactions**: their arrests, buys and other Timeline events, in date order
- **Rolodex** (home page, Ctrl+K and a case's Contacts): keep the ASAs, AUSAs, other police and anyone else you work with, with office, title, email, phone and notes. It is saved on the SSD:
  - In a case's Contacts, the name boxes suggest them. The prosecutor's box suggests ASAs and AUSAs. Picking one fills in the email and phone, and the ASA / AUSA title
  - The card button beside a contact saves someone typed on a case into the Rolodex
  - On the Write Report tab, *ASA* and *AUSA Approving Search Warrant* suggest them too

## What's new in v1.174

- **Closed cases' suspects are not suggested.** When you type a suspect's name (New Case, a case's Suspects, a Mission's Subject Data and New Case Group), the suspects and subjects of closed and archived cases are no longer offered
- **Fewer hover boxes.** The case list on the left no longer shows hover boxes such as *Fold or unfold*. Only a name that is cut off, and what a due count is waiting on, still show one. The boxes that just repeated a button (*Close*, *Open*) are gone too
- **New Case: search the known suspects.** Type in *Subject Name* and the suspects of your open cases that match are listed with their **Name, DOB, Gender and IR Number**:
  - Search by name, date of birth or IR number
  - Pick one: the Subject Name is filled in, and the person becomes the new case's main suspect with their details (date of birth, residence, description and record numbers) from the other case
  - *Undo* takes it back
- **Fix:** a suspect marked *Not identified* was suggested as "false" in the Suspects name box

## What's new in v1.173

- **Check the Mission.** *Mission Health* on the Mission page has a **Check the Mission** button:
  - It runs the rules check on every case number of the Mission, one after another, and saves each one on that case's Checks tab
  - A summary shows each case number with its High and Medium flags. It also warns when the same inventory number is on two case numbers
  - Photos are left out; only the written reports are compared. It uses no AI, so it is quick
- **Prosecutor Packet.** One PDF with:
  - Every buy, and the totals per suspect
  - The evidence, with inventory numbers, lab status and where each exhibit is now
  - The lab reports attached, and each exhibit's chain of custody with any gaps
  - Make it from a case's *Case Health* (it is saved in that case's Files, *Case Closing*) or from *Mission Health* for the whole Mission (it is saved in the Mission Folder)
- **Paste From Text** on the Timeline (next to *Quick Add*):
  - Paste text from CAD, RMS or a report. The date, time, kind of event (buy, arrest, court), title and a buy's narcotic, amount and money paid are filled in for you to check before adding
  - The whole text goes in the note
- **Read Labels** on the Write Report tab: an exhibit with photos gets a **Read Labels** button. It reads the photos on this PC for the inventory number on the evidence label and says whether it matches the Inventory Number, or is a digit or two off
- **Calendar File.** The open deadlines and court dates become a calendar file (.ics) to open in Outlook, with a reminder the day before:
  - From the Timeline, it is saved in the case's Files (*Other*)
  - From *Mission Health*, it covers the whole Mission and is saved in the Mission Folder (*Other*)
  - Nothing is saved on the PC

## What's new in v1.172

- **Case Health.** A new box at the top of a case's Details tab lists everything still open on the case, most serious first, each with a button to where it is fixed:
  - Overdue deadlines, open consistency flags (from the latest check) and a check that is out of date
  - [CONFIRM: …] left in drafts, exhibits without photos, gaps in the chain of custody, and the arrest details that don't match the case
  - When nothing is open, it says so. The Mission page has the same list for all its cases (**Mission Health**)
- **Chain-of-custody gaps.** Each exhibit's custody log is checked:
  - Checked out and never returned (High), taken to court while still checked out (High), anything after it was destroyed or released (High)
  - Sent to the lab with no return, a return with no checkout before it, a log that doesn't start with Received / Seized, entries without a date, narcotics never sent to the lab
  - On the Draft tab, an exhibit with gaps shows *1 gap* beside its Chain of Custody button, and the dialog lists them
- **The arrest against the case.** The Arrest tab now says when its details don't match the rest of the case:
  - An arrestee's date of birth differs from the suspect's (High), or the arrestee isn't one of the case's suspects
  - The arrest date differs from the Timeline's arrest, or is in the future
  - A charge names a drug that wasn't bought from that person or recovered, or a drug bought isn't charged
  - A recovered narcotic's inventory number isn't on the evidence list
  - It updates as you edit
- **Ready to close?** *Close Case* now also lists custody gaps, arrest mismatches, a check that is out of date, narcotics with no lab result yet, and exhibits with no final disposition. You can still close; it's a reminder
- **Templates: tables from the case.** New fields under *Evidence and Buys*:
  - `{{evidence}}`: a table of the exhibits with inventory number, item, weight and where it is now
  - `{{buys}}`: a table of the Timeline's buys with the total paid
  - `{{buys.count}}`, `{{buys.total}}` and `{{inventory}}` (every inventory number)
- **Known Aliases from the suspects.** A suspect's *Moniker / Social Media* (e.g. *Rick, Ricky*) now counts as a Known Alias in every check, without typing it again. The Checks tab shows which ones

## What's new in v1.171

- **Backups: tested, and when you choose.**
  - The Backups panel has *Remind Me Every 3, 7, 14 or 30 Days* for the full-backup banner
  - Each **Test Restore** is remembered: the panel says when the backup was last tested and whether it read back fine
  - If a full backup hasn't been tested in 30 days (or a test found problems), the home page asks you to **Test Backup**
- **A narrative from a Timeline buy.** New Report → Start From → **A Timeline Buy**:
  - Pick the buy and *Buy Narrative* or *Surveillance Narrative*
  - The narrative starts with what the Timeline and the evidence list know: date, time, suspect, drug, amount, paid and the inventory numbers of that drug
  - Everything else is a [CONFIRM: …] to fill in (location, what happened in order, vehicles, the field test…), listed under To Confirm
  - It is named *Buy 2 Narrative* / *Surveillance 2 Narrative*, so the Checks tab pairs the two. No AI is needed
- **Order of Events.** On a check's results, each Buy and Surveillance pair has an **Order of Events** button. It opens the two reports side by side: each sentence under the time it happened (a sentence with no time goes with the time before it). A time only one report gives is on its own row, so a gap or a different order stands out
- **One record per person.** When a suspect on this case has details the same person doesn't have on another case (a new address, a height, a phone…), the note under the suspect offers **Update on N Other Cases**:
  - It lists each case, a Mission's own cases included, with what would change, each with a tick box
  - Only the details this case has are copied. Details only the other case has stay there

## What's new in v1.170

- **Case Facts beside a draft.** In a draft's side panel, under *To Confirm*, Case Facts lists the case's facts to write from:
  - The Timeline's buys, and the evidence list (exhibits and inventory numbers)
  - For a Buy or Surveillance narrative, the dates, times, amounts, weights, plates and inventory numbers of its paired report
  - Click a fact to put it in the draft where the cursor is
- **Checked as you write.** A moment after you stop typing, the draft is compared with the case's documents, the Timeline and the evidence list (the same rules as the Checks tab; nothing leaves this PC):
  - What doesn't match is listed and underlined in red in the draft
  - **Use $200** (the right value) corrects it in one click
  - When everything matches, it says so
- **Use … on a check's results.** When a check of a draft finds a mismatch, the flag has a **Use …** button. It corrects the draft and marks the flag *Reviewed*, with a note. Attached files are never changed
- **Explain.** With the AI engine on, each rule-based flag has an **Explain** button. The AI on this PC says in plain words what differs and why it matters, and suggests a rewording you can copy. It's kept with the check
- **Lab reports.** The checker recognises a Lab report (*Lab*, *Crime Lab*, *Laboratory Report*… or chosen on the Checks tab) and checks it against the report of the buy with the same inventory number:
  - A different drug is flagged (High). *Crack* and *cocaine* count as one drug
  - A lab weight more than the field weight is flagged (Medium). The lab weighs the drug without its packaging, so a lower lab weight is normal and is no longer flagged as a mismatch
  - An inventory number that no other report gives is flagged
- **Privacy check before export.** *Before You Export* also lists details that must not go out: a Social Security, payment card, bank account or passport number, and the terms on your watch list (Settings), such as a CI's real name
- **Discovery.** The Discovery Index and the Discovery Receipt list the exhibits with their inventory numbers, from the evidence list

## What's new in v1.169

- **Fix (case list folders):** clicking a folder opens it every time:
  - Clicking its name unfolds it, opens its page, and it stays open (it used to fold back, or not open, now and then)
  - The arrow folds and unfolds it, and so does the space to the right of the arrow (the arrow alone was a tiny target)
- **Fix (case list counts):** every folder's count and arrow sit in one column at every depth, inside CLOSED too
- **Fix:** INDEPENDENT says how many open cases it has, like its count, then how many are closed (*1 case · 1 closed*)
- **Removed:** the X across a closed case with an arrest
- **Removed:** the logo at the top left. The name *CaseVault* still takes you to the home page
- **The closed folder icon** is teal again. The Closed tag and the red border of a closed case stay
- **Checks: you choose the pairs.** On the Checks tab each report has a choice of what it is: *Auto* (by its name), *Buy*, *Surveillance* or *Other*:
  - Under the list, each Buy report gets a *with* choice: *Auto*, a Surveillance report, or *Not Paired*
  - Your choices are kept with the case
- **Checks: the evidence list.** Every inventory number in the documents is checked against the exhibits on the Draft tab:
  - A near-identical number is a likely typo (High)
  - A number not on the list is flagged (Medium)
  - An exhibit that no document mentions is noted (Low)
- **Check before you export.** Export, PDF View and Word View of a draft first compare it with the case's documents:
  - If something clearly doesn't match (an amount, a date, an inventory number…), a *Before You Export* box lists it, with **Run Full Check**, **Cancel** and **Export Anyway**
  - Once you export a text anyway, you aren't asked about that same text again
- **Out-of-date checks.** When a document changes after a check, or is removed, the check says **Out of Date** in Past Checks. Its results show which documents changed, with **Run Again**

## What's new in v1.168

- **Suspects: Fill In From a Mission's case.** When you add a suspect to a case (an independent one, for example) and type a name that is a suspect on another case, the note under the suspect now has a **Fill In From EX-200** button:
  - It copies that person's date of birth, residence, description and record numbers into the boxes you left empty. Anything you already typed stays
  - A case in a Mission (a group case) is used first, then the one with the most details
  - While you type a name, the suspects of your other cases are suggested, those on a Mission's cases first
- **Consistency Checker: Buy and Surveillance reports, checked in pairs.** The checker recognises a Buy report and a Surveillance report from their file names (*Buy 2.pdf*, *SURV-2.docx*, *Controlled Purchase…*) or from their first lines, and marks them in the list. It pairs each Buy report with the Surveillance report of the same buy: the same number in the name, the same date or the same inventory numbers. In each pair:
  - **Inventory numbers must match:** a number in one report that is missing from the other is flagged High. A near-identical number (*12345678* / *12345687*) is flagged once, as a likely typo
  - A date, an amount paid or a plate one report gives and the other doesn't is noted (Low: surveillance may not have seen it)
  - Reports of two different buys are no longer compared with each other, so *$200* on Buy 1 and *$300* on Buy 2 isn't flagged as a mismatch
  - The results list the pairs checked, under a new **Inventory Numbers** group
- **AI: the two narratives side by side.** With the AI engine on, the AI reads each Buy report together with its Surveillance report and lists where the narratives contradict each other:
  - It looks at the time, the order of events, who was there, the vehicle, the place, the amount, the drugs and the inventory numbers. A detail only one report gives doesn't count
  - Each difference quotes both reports. An answer whose quotes aren't found word for word in the reports is dropped
  - This works without an affidavit too: choose *None: compare the reports with each other*
- The checker now reads inventory numbers anywhere (*Inventory #12345678*, *Inv. Nos. 12345678, 12345679 and 12345680*), so an affidavit is checked against the reports' inventory numbers too

## What's new in v1.167

- **Closed is red, not green.** A closed case is now marked in red everywhere: the **Closed** tag, the closed folder icon (CLOSED in the case list, Closed Files on the home page, the Year Summary) and the case colour in the themes. This is most visible for a case closed while its Mission is still open:
  - In the case list, its box has a red border all the way round (thicker on the left) and a red lock before the case number
- **An X for a case closed with an arrest.** When a closed case has Arrest details, its box in the case list has a red X across it, and so does its card on the home page's open Mission. The text stays readable through the X, and pointing at the box says *Closed with an arrest*

## What's new in v1.166

- **Secure Locker: each row on one line.** The Password Manager and Covert tables show each row on one line, with nothing cut off and no sideways scroll bar:
  - **Strong / Weak** and the password's age now sit beside the password instead of under it. The age is short (*Today*, *45 days*), and the full date is in the hover box
  - **Edit** is now a pencil icon (point at it to see *Edit*), and the row buttons are smaller and closer together
  - The tables use the whole width of the window
  - The **Department** column shows only once a row has a department
  - Shorter column headings: *Alias*, *Birth Date*, *Phone*, *Platform*, *Handle*. Point at one to see the full name
  - The buttons are no longer pinned over the other columns
- **Narrow windows:** when a window is too narrow for one line, the table still doesn't scroll sideways or cut anything. Instead, long names wrap between words and the Strong / Weak tag goes under the password. Then the text gets a little smaller and an email breaks after its @. Phone numbers and dates never break. Hiding the sidebar gives the table more room
- **Fix:** a new locker said *Locks after undefined minutes*, and its Lock After list showed 2 minutes. Both now show the real setting, 5 minutes

## What's new in v1.165

- **Fix (folder counts):** every folder now shows how many it holds, including 1 and 0 (an empty folder shows a grey 0). This applies on the home page (Mission, Year and General tiles, shared folders) and in the sidebar, where the OPERATION folder and CLOSED → OPERATION now show their counts too
- **Sidebar: a quieter look.** The buttons along the top of the sidebar are now plain outline icons in one muted colour, with colour only when you point at one or when it is on. The green padlock stays as it is. The + buttons for a new case are gone from the sidebar; use **New Case** or **New Mission** on the home page, the menu, **N** or **Ctrl+K**
- **Training: Groups.** Edit a certificate (✎) and type a **Group** (for example *CPR* or *Firearms*); earlier group names are offered as you type. In Cards view each group gets its own heading with a count, and the ungrouped ones go last under *Other Certificates*. In Arrange, dragging a card onto a card in another group moves it into that group
- **Training: faster.** Certificate pictures are drawn only when their card comes on screen, and each picture is saved on the SSD (in a hidden folder inside Training), so opening Training again shows them at once. A picture is redrawn only when its file changes
- **Shortcut:** press **T** (when not typing) to open Training. The list of shortcuts (?) shows it
- **AI: Keep the Model Loaded.** In the Consistency Checker's engine settings you can choose how long the AI model stays in memory after a task: 2, 10 (default) or 30 minutes, or *Unload When Done* to free memory straight away
- **AI: less waiting.** The Consistency Checker's AI review now skips statements the rules have already settled with high confidence, and statements that match the source word for word. The results line shows how many were skipped
- **Faster sidebar:** switching tabs or cases no longer redraws the whole case list when nothing in it changed

## What's new in v1.164

- **Fix (drop-down lists in Firefox):** Firefox now uses its own drop-down lists. It could open its built-in list on top of CaseVault's, so the two fought over the click (Edit Alias and other forms). Firefox's list is square already; Chrome and Edge keep CaseVault's
- **Fix (drop-down lists):** moving through a long list (with the arrow keys or by typing a letter) scrolls only the list, never the form behind it, and picking a value no longer scrolls the form either
- **Training: Arrange.** In Other Files → Training (Cards), **Arrange** lets you put the certificates in the order you want, to keep similar ones together: drag a card onto another to take its place, or use the arrows under each card (it shows its place, *2 of 6*). **Done Arranging** finishes. The order is kept on the SSD (in the Training folder) and used by the Cards and List views; a certificate added later goes last. The Training Record PDF still lists them by date
- **Updater 1.4: a quieter look.** Neutral greys with a charcoal main button, a plain light header, a thin progress bar and thin borders. The spinning vault door is gone: while it works the header just says *Working…*

## What's new in v1.163

- **Document Anonymizer: live, colour-coded review.** What's found shows as you type: red critical details (Social Security, card and bank numbers, dates of birth, ID numbers), orange high (phones, emails, addresses, plates, VINs, case numbers, known names), yellow medium (guessed names). Click a highlight to keep that detail (every mention of it), click again to replace it; red ones and known names are always replaced. The result updates as you go
- **Document Anonymizer: styles.** Fictitious (John Doe, as before), Placeholder [NAME_1], REDACTED, Black Bar ████, or Initials (J. D., for names only; other details get their placeholder so no digit is given away). The local AI's second look goes with the Fictitious style
- **Better names** for the Anonymizer, the mail check and the Library: hyphenated (Roe-Poe-Doe), Mc / Mac / O', particles (Maria de la Cruz, Pieter van der Poe), DE LA CRUZ, Maria, and a name in capitals in running text (arrested JOHN DOE); headings in capitals are left alone. A word that isn't a name no longer hides the name next to it ("Later, John Doe"), and a hyphenated or Mc / O' name is found at the start of a sentence too
- **Better addresses and phones:** compass points (NW, North), floors and buildings, the city, state and ZIP after them, PO Box #; phone extensions ("ext.", "extension", "x"), +1, dots and spaces, and "contact" / "fax" labels
- **Known names come first:** a name from the case, your profile or the watch list always beats a guessed one
- **Fix:** a full stop taken with an address ("Oak St.") stays in the replaced text, and putting the values back gives the original exactly

## What's new in v1.162

- **Consistency Checker: names.** Nicknames count as the same name (*Bill / William*, *Rick / Rich*, *Beto / Roberto*). Names are read in context: *Mary Poez / Mary Poes* is flagged as one person spelled two ways, *Jon Doe / Joan Roe* is two people and is not flagged
- **Consistency Checker: Known Aliases.** A box on the Checks tab for the names that belong to one person (one person per line). They are saved with the case, never flagged as spelled differently, and the AI is told they are the same person
- **Consistency Checker: addresses.** Abbreviations, *Fifth / 5th*, *North / N.*, *Mount / Mt*, the unit word (*Apt.*, *Apartment*, *Suite*, *#*) and punctuation no longer make two addresses differ
- **Consistency Checker: weights and totals.** Weights are compared in grams (*1 oz* = *28.35 grams*). A stated total is checked against the amounts or weights listed with it (*$200, $300 and $500, a total of $1,100*: they add up to $1,000), and is only ever compared with another total. An amount the report already matches is no longer counted against the other amounts of the same sentence
- **Consistency Checker: the Timeline buys.** Each buy on the Timeline (the Buy Summary) is checked against what the documents say about a buy on that date, and a total paid or total weight against all the buys and each suspect's buys
- **Consistency Checker: confidence.** Every flag has a confidence (High, Medium, Low) beside its severity, with **Hide Low Confidence**. The flags are grouped by kind (Names, Addresses, Money, Weights and Totals, Dates and Times, Numbers, Plates and Phones, Statements)
- **Consistency Checker: Mark as Reviewed and Dismiss** replace Fix / Not an issue / Explained, each with a note. A dismissed flag leaves the list (**Dismissed only** shows it). Older checks open as before
- **Consistency Checker: AI.** A clearer prompt: spelling, formatting, abbreviations, nicknames and the same time or weight written another way are not contradictions; the AI says how sure it is, and a contradiction the rules also found is High confidence. On a slow computer the AI stops early (2 minutes a statement twice in a row, or 20 minutes in all) and the rule-based results stand
- **Self-test:** a step for nicknames, address formatting and a wrong total

## What's new in v1.161

- **Fix (case list counts):** a folder holding a single case now shows its count (1) like the others; before, the count only appeared from two cases up, so a Mission or INDEPENDENT with one case looked empty
- **Case list:** the handcuff icon is gone from CLOSED; it shows just how many cases are closed, in the same grey box as the other folders' counts

## What's new in v1.160

- **Fix (drop-down lists):** the drop-down lists (Gender, Nationality, the ID states and every other list) open in every window, also the ones low in Edit Alias. A list no longer closes the moment the window scrolls; it moves with its box, and closes only when the box leaves the screen
- **Fix (lists with suggestions):** the suggestion lists of the boxes you can type in (narcotics, platforms, departments and others) show on top of the window instead of being cut off at its edge
- **Case list:** the counts, the green + buttons and the arrows of every folder sit in one straight column, top folders and the missions inside them alike; a folder name stays on one line
- **Case list:** CLOSED shows a handcuff icon and how many closed cases it holds, on the right
- **Secure Locker:** the buttons of each row (notes, Edit, the up and down arrows, delete) line up from row to row, also when some rows have notes and others don't
- **Timeline:** the Paid box of a Buy fills in as money while you type ($1,234.5) and adds the cents when you leave it ($1,234.50); it is saved as a plain number, so the Buy Summary totals are unchanged

## What's new in v1.159

- **Fix (case list top icons):** with the case list made narrower, its top icons wrap onto a second line instead of running past its right edge, so the padlock (last, on the right) stays inside the list in every browser and at any width
- **Case list names:** LAST, First and the middle initial line up in three columns in the Case Group folders too (a group named like "DOE, John Q"; a name such as "Doe Family" stays as typed). The columns are as wide as the longest last and first name in the list, so names are never broken in the middle and every row still fits

## What's new in v1.158

- **Fix (privacy screen):** refreshing the page (F5 or Ctrl+F5), or closing and opening CaseVault again, while the screen is hidden no longer opens CaseVault. The screen comes back as soon as the vault opens, before any case is shown, and only the PIN opens it (a click, Esc or a wrong PIN don't). The browser keeps only the word "locked" while the screen is on, no case data; the PIN clears it. Without a PIN set, it opens with a click, as before

## What's new in v1.157

- **Arrest mark:** a case with an arrest (it has Arrest details) has a purple border and an ARREST tag in the case list, the way a reminder has its red border. A case with both shows red on the left and purple on the right
- **Fix (Firefox):** with the case list hidden, the rail now has a fixed width that every button fits in, so the padlock (and every other icon) stays inside its border at any zoom or text size
- **Case list:** a Mission's number and its name are in different colours (number in navy, name in grey)
- **Case list:** the subject reads LAST, First and the middle initial in three columns that line up from one case to the next
- **Case list:** a CLOSED folder under the open ones, with OPERATION (closed Missions, and the closed cases of Missions still going on) and INDEPENDENT (closed cases not in a Mission) inside. It starts folded
- **Fix (Covert Accounts):** the Copy buttons are fully shown, and the email stays on one line and is shown whole (the table scrolls sideways if it needs more room). Usernames and handles are no longer broken letter by letter
- **Secure Locker:** Department is a narrow centred column right after the first column (Platform / App, Site / System, Alias Name)
- **Covert aliases:** Gender, Nationality, Ethnicity, Civil Status, Blood Type and Body Type are drop-downs. A value typed before that isn't in the list is kept
- **Covert aliases:** each ID has its state: Driver's License State, State License / ID State, Library Card State and Other ID State
- **Covert aliases:** More Email Addresses and Mailing Addresses (type, address, box or unit, provider, key or code), as many as you need. What was in the single Mailbox box becomes the first mailing address
- **Covert accounts:** each account can store its social media accounts (platform, username or handle, web address). The table shows how many, and the hover box lists them

## What's new in v1.156

- **Password Manager:** the Email is shown in full (it wraps instead of being cut off). New columns: **PIN** (hidden until shown, like the password) and **Department** (CPD, DEA, USPIS, FBI, HSI, ATF, USMS, IRS-CI, ISP, or your own). A **Linked to Google** checkbox shows as a small Google tag next to the email
- **Covert aliases:** each alias now has a full profile in sections: Identity (gender, nationality, ethnicity, date of birth, age and zodiac worked out from the date of birth, height, weight, body type, civil status, blood type, hobby, two languages), Identification (Social Security, driver's license, state license, library card), Contact (with mailbox details), School (high school and college), Work History (employer, position, address, years, phone; add as many as you need), Family (name, relation, date of birth, phone, notes) and Backstory
- **Department filter:** the buttons above the Password Manager, Covert Aliases and Covert Accounts show All or one department, so you can switch between your DEA and CPD covert aliases and passwords
- **Hidden case list:** the hover boxes of the rail icons now open to the right of the icon, and your last 3 opened cases sit on the rail (the last 4 characters of the case number) to jump back
- **Select Cases:** a new button at the top of the case list picks several cases at once to pin or unpin, put in a Case Group, move into a Mission, or archive together (one reason for all)
- **Saved searches:** under the case-list search box, quick filters Due This Week, Overdue, Pending and Pinned. Type a search and click Save Search to keep it there; × removes it. The search box now takes words in any order, and filter words: due:week, due:overdue, due:today, due:month, status:pending (or any status) and pinned
- **Chain of custody:** each exhibit on the Draft tab has a Chain of Custody button: a dated log of who had it (received or seized, placed in evidence, checked out, returned, sent to the lab, taken to court, released, destroyed), who released it and who received it, and why. The button says where the exhibit is now. Print one exhibit's log, or every exhibit's with Chain of Custody PDF (it can be saved in the case's Files next to the report)
- **Calendar:** a new home page tile (and Ctrl+K) shows a month of every open case's deadlines, court dates, buys, arrests and statutes of limitations. Turn each kind on or off; click a day to list it, and an item to open its Timeline
- **Weekly Summary:** a new home page tile (and Ctrl+K): what changed on each case this week (Case History changes and notes, Timeline items, opened and closed), week by week, printable as a PDF
- **Duplicate files:** adding a file that is already in the case (the same content, whatever its name) asks first: Skip Duplicates or Add Anyway
- **Check the Vault:** once a month, a minute after the vault opens, CaseVault compares the case folders on the SSD with the case list and reads each case's data files, and only says something if a folder is missing, a case is not listed, a data file is damaged or a file is empty. Ctrl+K → Check the Vault runs it any time; nothing is changed
- **Faster start:** Year Summary, Group Summary and the new Chain of Custody, Calendar and Weekly Summary load the first time they are used

## What's new in v1.155

- **Hidden case list:** the thin rail on the left is now as wide as its buttons, so no icon (such as the padlock) is pushed outside it in Firefox, with a bigger font, zoom or Bigger Text. On a short window the icons scroll up and down inside the rail instead of spilling out

## What's new in v1.154

- **Export Encrypted saves on the SSD, never on the PC:** pick a folder in `CaseVault-Data\exports\` on the CASEVAULT drive, or make a new one (it is named after the case at first). The file is read back and compared before CaseVault says it is saved, and a second export never overwrites the first. Nothing goes to the PC's Downloads folder any more
- **Import Case lists the exports on the SSD:** pick one, or **From Another Drive…** for a `.cvcase` on a USB stick

## What's new in v1.153

- **Undo:** deleting a Timeline entry, a file or a report, and moving a file, shows **Undo** for 10 seconds. A deleted file waits in the case folder's hidden `.trash` until then (an hour at most), so even a large video comes back
- **Report versions:** **Versions** (in a report's button bar) lists the last 10 versions of that report: one is kept every 10 minutes while you write, and one when it is deleted. Click one to read it; **Put This Version Back** restores it (the text from before is kept as a version too)
- **Quick Add on the Timeline:** pick a common entry (Search Warrant Served, Controlled Buy, Arrest, Court Date, Grand Jury Subpoena Served, Phone Extraction Requested, Evidence Sent to the Lab). It fills the form and can add the deadline that follows it, such as the warrant return 10 days later; the days can be changed
- **Court dates:** a new **Court** type on the Timeline. From 7 days before, the entry counts down (Court in 5 days … Court tomorrow), and the home page's **Today** panel lists the court dates of the week
- **Copy Case Details** (Details tab, case actions): the case number, subject, charges, next court date and next deadline as plain lines to paste into an email. They are cleared from the clipboard after 2 minutes
- **Same person on another case:** typing a suspect's name (and date of birth) that is already on another case shows a yellow note with a link to that case
- **Before You Send:** Send Draft to Reports first checks the narrative against the evidence list (an exhibit mentioned but not listed, or listed but never mentioned), that its dates are in order and none is in the future. They are reminders: **Send Anyway** goes on
- **Discovery log:** in Files → Discovery → Earlier productions, **Print Discovery Log** makes one page per case: each recipient, what was produced to them, when, and the Bates range
- **Backup reminder after 50 changes:** besides every 7 days, the full backup is due again after 50 case saves since the last one
- **Lock when the SSD is pulled:** the page, any open popup and the messages are cleared at once, and with a PIN set the privacy screen locks
- **Export Encrypted** (Details tab, case actions): the whole case folder in one `.cvcase` file locked with a password (AES-256, the same as Discovery). Since v1.154 it is saved on the SSD, in `CaseVault-Data\exports\` in a folder you pick or make, never on the PC. **Settings → Backups → Import Case** lists the exports on the SSD (or takes one from another drive) and opens it. CaseVault does not keep the password
- **Bigger Text** (⋮ → Options → Display): Normal, 110% or 125%. Only the words grow; Zoom still makes everything bigger
- **Alt+1 … Alt+9** open the tabs of the case you are on, in order (Alt+1 Details, Alt+2 Timeline …)
- **Pinned cases** (the pin on the home page) are listed at the top of the case list too
- **Faster start-up:** Reports and the Draft tab load the first time they are opened, like Discovery and Link Chart

## What's new in v1.152

- **Back to your own Firefox:** `Start-CaseVault.bat` opens CaseVault in a new tab of your normal browser again, with your settings, sign-in and look (v1.151 opened a separate, empty browser profile on the SSD). The addresses still hide case numbers and names, so nothing about a case lands in the browser history. The `CaseVault-Browser` folder v1.151 made on the SSD can be deleted
- **Reconnect fixed:** when the helper was restarted (an update, or Start-CaseVault.bat run again), an open CaseVault tab said "The CaseVault helper is not running" and Reconnect did nothing, because the tab had the helper's old key. It now says **Start CaseVault Again to Reconnect**; double-click `Start-CaseVault.bat` and every open CaseVault tab reconnects by itself
- **Helper 1.16.1:** opens your normal browser by default; `-OwnProfile` (advanced) still opens the separate profile on the SSD

## What's new in v1.151

- **PDF viewer:** PDFs now open at **Fit Width**, as wide as the window. The zoom buttons, 100% and Fit Width are still there
- **Addresses without case data:** the address of a page in CaseVault no longer shows the case number, a Case Group's name or a report's name (`#/case/~aXHa…` instead of `#/case/2026-EX-100`). They are scrambled with a key kept in vault.json on the SSD, so the browser history on the PC means nothing without the drive. Old bookmarks still open and are rewritten
- **Own browser window and profile (Start-CaseVault.bat, helper 1.16):** CaseVault opens in its own browser profile on the CASEVAULT drive (`CaseVault-Browser`): an app window in Edge or Chrome, a separate window in Firefox. History, cache and saved permissions stay on the encrypted SSD. In Edge or Chrome, pick `CaseVault-Data` once the first time (**Choose folder…**)
- **Helper key (helper 1.16):** the helper now answers only the CaseVault window it opened. Each start makes a new random key that this window carries; other programs and plain tabs are refused. Always open CaseVault with `Start-CaseVault.bat`, not a bookmark. File names Windows treats as devices (CON, NUL, COM1…) are refused
- **Backup said once:** while the backup bar under the banner shows, the banner leaves out its own red backup chip. Hide the bar for today with × and the chip is back
- **Details tab:** where the case is filed is shown once, in the header; the grey bar keeps only its buttons (Case Group, Pin, Move File)
- **Floating buttons:** they fade while the page scrolls, so the text passing under them can be read. They come back when scrolling stops, or on hover
- **Files tab:** empty folders are greyed, so the ones holding files stand out. **All Documents** and **Choose Files** in Title Case
- **Faster:** Discovery and Link Chart load the first time they are opened instead of at start-up. Mission and Case Group pages, the Mission Timeline and the Group Summary read their cases together instead of one by one
- **Tidier code:** the backup screens moved out of app.js into their own file; one shared date helper and one shared dialog Cancel row replace copies spread over many files; 24 unused style rules from removed features are gone

## What's new in v1.150

- **Today panel fixed:** it now shows every time you come back to the home page, not only the first time
- **Faster home page:** the Today panel reads the Timelines 8 at a time instead of one by one (about twice as fast with many cases)
- **Privacy:** whether a Case Group folder is open or folded is no longer saved in the browser on the PC (its name is often a suspect's). It is remembered until CaseVault is closed. Group names saved there by v1.146 to v1.149 are removed the first time 1.150 opens

## What's new in v1.149

- **Use as AI Example:** in a report's Export menu, **Use as AI Example** puts an anonymized copy in Settings → Library (names, phone numbers and addresses replaced) and asks which document type it is an example of. You see the copy before it is saved
- **Library check:** Settings → Library shows how many examples each document type has; a type with none is in red, so you know where Draft with AI has nothing to copy the style from
- **Real names warning:** when you drop a file into the Library, CaseVault looks for names, phone numbers and other identifying details first. If it finds any, you choose **Save Anonymized Copies**, **Keep As They Are** or Cancel
- **Today:** a panel on the home page lists everything dated today and tomorrow on the Timelines of your open cases, soonest first. Tick a deadline there to mark it done
- **Quick Note:** **Alt+N** (or ⋮ → Quick Note) from any page writes a note into a case's Case History with today's date and the time, or into each case of a Case Group. Ctrl+Enter saves
- **Discovery checklist:** before a production is copied, a short checklist: Arrest Report filled in and evidence photos added (checked by CaseVault), then reports signed, Bates start number right and password given separately (you tick them). **Skip Checklist** goes straight on
- **Password strength:** each saved password shows **Weak**, **OK** or **Strong**. Click **Weak** to open Edit, where **Generate** makes a strong one. The strength also shows as you type
- **Lock After:** the Secure Locker locks after **2, 5 or 15 minutes** without use (5 unless you change it, in the locker's header)
- **Backup history:** Settings → Backups → **Full backup history** lists the last 10 full backups: date, drive or folder, size and whether it was checked
- **Test Restore:** Settings → Backups → **Test Restore**. Pick a CaseVault-Backup folder on the backup drive; CaseVault reads 20 random files of it (and the case list) and compares them with the SSD. Nothing is changed or copied

## What's new in v1.148

- **Case Group page:** **Timeline** shows the events of every case in the group on one Timeline (each case's Timeline tab does the same, like an Operation's). **Summary PDF** lists each case (number, subject, status, opened, next deadline, charges from the Arrest Report) with your letterhead. **Make Operation** turns the group into an Operation with the same cases when the investigation grows
- **How many are due:** a red Operation in OPERATION, or a red Case Group in INDEPENDENT, shows a small red number: how many of its cases have something due. Hold the mouse over it for the list (case, what, when)
- **Snooze a deadline:** on the Timeline, **Snooze** on a deadline that is due quiets its alert for a day, 3 days or a week ("Snoozed until …"); the bell and the red case come back by themselves after that, or at once with **Wake**. Another deadline of the same case still rings
- **Password age:** each password shows when it was set ("Changed 400 days ago"). **Remind After 90 / 180 Days / 1 Year** (in the Password Manager's header) marks older ones in red. Passwords saved before this version show their age once they are changed
- **Copy Username:** the username has its own Copy button, like the password
- **Last Contact (Confidential Files):** the pencil on a file now has **Last Contact**; it shows in its own column, and a click on the column heading sorts the longest-ago first
- **Operation folders in order:** By Number, Newest First, or Most Alerts First, in the Operation Cases header (kept on this PC)
- **Pin a case:** the pin by a case in Recently Updated (or **Pin** on the case's Details) keeps it at the top of Recently Updated, even after Clear
- **Updater (1.3.2):** when an update fails, **Save Problem Report** writes a text file (what the updater did, the error, the versions; no case data) in `updater\problem-reports` to send to the developer

## What's new in v1.147

- **Home page folders:** the names under the folders (Operation Cases, General Files, Closed Files, Archived, Other Files) start at the left, under the left edge of each folder
- **Case list alerts:** an Operation inside OPERATION that has a case due is highlighted red (red edge and shading, its number in red), so you can see which one has the alert. The bell stays on the main folder
- **Status columns:** in General Files, Missions and every other list, the status word (Open, Closed, Archived) is on the left of its box and its icon on the right, every box the same width
- **Case list:** the main folders are now just **OPERATION** and **INDEPENDENT**

## What's new in v1.146

- **Case Groups for independent cases:** keep related independent cases together under a name you give (a suspect, a family, a crew), like an Operation but not one. **New Case Group** (General Files) or **Case Group** (on an independent case's Details) asks for the name and lets you tick the cases that belong. The group shows in INDEPENDENT CASES with its cases under it; its name opens the group's own page (its cases as cards, **Edit Group** to rename it or change its cases, **Ungroup** to take it apart). The same name written another way ("doe, john") joins the group already there. (This replaces v1.145's Suspect Folder; groups made then are kept.)
- **Case list:** OPERATION CASES and INDEPENDENT CASES are written the same size. The red bell is only on those two main folders; inside them, a case that is due is shown in red (no bell on a Mission's own folder)
- **Password Manager:** Edit and the arrows were pushed out of sight by a long site name or web address (they only showed while searching). Long text is now cut with … (hold the mouse over it for all of it), and the buttons always show
- **Confidential Files:** each file is marked **Active** (green) or **Inactive** (red); click it to switch. New files start Active
- **Updater (1.3.1):** a small, plain window again: the banner, the version line, one line of status, the progress bar and the buttons. **What's New** opens the notes (and Show Files) only when you ask
- **Tidy up:** unused folder icons removed; the README brought up to date with a map of the repository's folders

## What's new in v1.145

- **Recently Updated:** in each status box the word (Open, Closed…) sits on the left and its icon on the right, in every row the same
- **Operation Cases:** the MISSION FILES folder (case list and home page) is now called **OPERATION CASES**
- **Archived → Rename Folders:** give the archive folders (EXPIRED, NOLLE PROSEQUI, PROSECUTION, Other) your own names. Only the names change; every case stays in its folder. Leave a box empty to go back to the standard name
- **Suspect folders for independent cases:** on an independent case's Details, **Suspect Folder** puts it in a folder with the suspect's name under INDEPENDENT CASES, with the other cases about the same person. It is not a Mission: each case stays on its own. The same name written another way ("doe, john") joins the folder already there. **Take Out of Folder** takes it out; a case moved into a Mission leaves its folder. General Files shows the folder in the Mission column
- **Training cards:** a certificate card shows just the course name and, when there is one, when it expires (the date completed and hours are in the pencil's details and the hover box)
- **Password Manager, arranged your way:** the arrows on each row move it up or down; **Sort A to Z** puts the list in order once. The order is kept in the locker
- **Password Manager, Edit:** each entry has an **Edit** button (with its word) to change the password, username, web address or notes
- **Password Manager, old passwords:** when you change a password, the old one is kept with the day it changed. **Old (N)** on the row opens the list under it (each hidden until shown, with Copy); the Edit box lists them too, and one can be removed there. Up to 20 are kept per entry, encrypted in the locker like everything else. Covert Accounts keep their old passwords the same way

## What's new in v1.144

- **Updater: a new look (updater 1.3):** the CaseVault Updater window now looks like CaseVault: off-white and navy, square corners, larger text (11 pt, headings 12 pt), and a navy banner with the vault door whose handle turns while it works
- **Updater: versions at a glance:** a strip under the banner says **Installed 1.143 → Available 1.144**, and **Installed 1.144 · Up To Date** when there is nothing new
- **Updater: What's New:** before you install, the window lists what each newer version brings (the same notes as here) instead of a list of file names. **Show Files** still shows the files it will change
- **Updater: steps:** **Check · Download · Install · Done** across the top show where it is; each turns green when finished, and red where something stopped
- **Updater: Open CaseVault:** when the update is done, **Open CaseVault** starts it for you. The updater updates itself, so the new look shows the next time you start Check-For-Updates.bat

## What's new in v1.143

- **Arrest Report: no more "null":** the word null showed on the Arrest Report tab under the arrestees (where nothing was meant to be). Gone; a check of every page now makes sure no "null", "undefined" or "NaN" shows anywhere
- **Timeline: arrests under their suspect:** an arrest from the Arrest Report goes under the suspect it is about, even when the name is written another way ("Johnathan Q Doe" on the Arrest Report, "DOE, Johnathan" on the Timeline), so each suspect has one filter, not two. Filtering by the suspect shows their arrest with their other events, and their filter shows small red handcuffs when they were arrested. The arrest's title keeps the name from the Arrest Report

## What's new in v1.142

- **Arrests stand out on the Timeline:** a new event Type **Arrest** with a red **ARREST** badge with handcuffs, a red square on the line (the others are round) and a thick red edge, whatever the suspect's colour (their name box keeps it)
- **Arrests added by themselves:** every arrestee on the case's **Arrest Report** with a name and an Arrest Date shows on the Timeline as "Arrest of NAME" on that date (with the time and charges), with an **Arrest Report** button instead of Edit / Delete: change it on the Arrest Report. An Arrest event you add yourself for the same person on the same day takes its place, so it isn't listed twice. Mission timelines show the arrests of every case number. In the Timeline PDF an arrest is marked **[ARREST]** with a red square and rule
- **Bigger, even text in CaseVault:** text 11 pt, small text (labels, hints, badges) 10 pt and never smaller, headers 12 pt, on every page
- **Bigger, even text in the PDFs:** text 10 pt and section headers 12 pt on the Supplementary Report, Arrest Report, Timeline, Case Summary, Year Summary and Training Record. The small captions inside the form boxes stay small, as on a printed form, so the forms keep their layout

## What's new in v1.141

- **Find (Ctrl+K) finds certificates and Other Files:** type part of a course name, who gave it or a file name ("narcotics academy", "lab request"). Certificates show as **Certificate** with who gave it and when; other files as **File** with their folder. Enter opens it. **Training** and **Training Record** are in Find too
- **Cards or List for every folder:** each Other Files or Mission folder has **Cards | List** beside Close. Cards show each file as a same-size card with a picture of its first page (PDFs and photos). The choice is kept on this PC for each folder. Training starts as Cards, the others as a List
- **Timeline → Group by Suspect:** the button beside Buy Summary shows each suspect's events together under their name, in their colour, with a count. Events without a suspect come last under **No Suspect**. Click again to go back to date order; the choice is kept on this PC. **Print Timeline** follows it. Without grouping, the PDF now has its own **Suspect** column on the right, so the names line up
- **PDFs without a letterhead:** when no department letterhead is set (Settings → Letterhead), Reports, Arrest Reports, Timelines, Case Summaries, Year Summaries, Training Records and Link Charts show a slim header with the CaseVault vault mark instead of a blank space. With a letterhead, nothing changes

## What's new in v1.140

- **Certificate details (Training):** the pencil on a certificate card opens **Certificate Details**: Course, Given By, Date Completed, Hours and Expires. The card then shows the course name, the date completed and the hours, and when it expires. These details are kept with the vault (Training\.training.json) and are removed when the certificate is deleted
- **Renewal reminders:** a certificate with an expiry date shows in **Needs Attention** 90 days and 30 days before it expires, and in red once it has expired ("Certificate Expired · 7 days ago"). Its card says **Renew in N days** or **Expired**. Click the reminder to go to Training
- **Training Record (PDF):** the **Training Record** button in Training lists every course with its date, hours and expiry, and the total hours, with your letterhead and name (from My Profile). Tick **Add the certificates after the list** to put each certificate's pages behind the list, one per page
- **{{training}} in Drafts:** a template can use **{{training}}** for the Training & Experience paragraph ("Your Affiant has completed the following training: Basic Narcotics Investigations (Example Police Academy, March 4, 2024, 40 hours); …. In total, your Affiant has completed 48 hours of training."). Also **{{training.list}}** (one course a line), **{{training.hours}}** and **{{training.count}}**. They are listed under **Your training** in the placeholder help

## What's new in v1.139

- **Favicon and app icon:** the vault door, on navy with gold bolts, in the browser tab, the taskbar and the unlock screen
- **Other Files:** the folders show their name only (USPIS Files, DEA Files, INET Files, Training, Other and your own), so the tiles match. Holding the mouse over one still says what it is
- **Training → certificates:** each file in Training shows as a card of the same size with a picture of its first page. Landscape and portrait certificates sit in the same frame, the cards line up in even rows, and the full name shows under each picture (without .pdf). Click a card to open it; the bin deletes it. Photos (JPG, PNG) show the same way. The pictures are made in memory while CaseVault is open; nothing is saved on the PC

## What's new in v1.138

- **Timeline:** an event's suspect now shows on the right of its box, in a name box the same width on every event, so the names line up down the timeline. Long names wrap instead of being cut off
- **Top-left logo:** the vault door from the banner. Its handle turns a quarter when the mouse is over CaseVault

## What's new in v1.137

- **Home page:** the Year Summary tile has its icon; the Ask AI tile is gone (Ask AI is the round button in the lower corner)
- **Top bar:** the Network, Local AI, Memory, SSD and Power Off icons no longer have words under them. Their colours still show the state, and holding the mouse over one says what it is
- **Banner:** the shield is replaced with a vault door whose handle turns now and then, as if unlocking. It stays still when Windows is set to show fewer animations

## What's new in v1.136

- **Year Summary** (the Year Summary tile on the home page, or Ctrl+K → Year Summary): pick a year to see the cases opened, closed and archived in it, arrests by month, charges (felony, misdemeanor, other) with the 10 most common, and narcotics recovered, added up by narcotic and unit. **Print / PDF** makes a one-page PDF with your letterhead. Counted from the case dates and the Arrest Reports (arrest date, charges, recovered narcotics)
- **Archived → Review:** choose **Review After 3, 5, 7 or 10 Years** in the Archived section (kept with the vault; Off to begin with). When archived cases pass that age, a **Review (N)** button lists them with the date archived and the reason, to check against your agency's records-retention rules. CaseVault deletes nothing on its own

## What's new in v1.135

- **Faster typing on the Draft tab:** the part that keeps each field's label from being cut off was measuring every field again and again while you typed (on a slow laptop that could freeze the form). It now measures a field only when its size or label changes. The Arrest Report no longer rewrites "Not saved yet…" on every key
- **AI suggestions as you type** (Drafts) are now set for each PC, and start off on a PC without a graphics card for the AI, where they slow typing down. The note next to the box says so; tick it to turn them on for that PC
- **Statute of limitations, earlier notices:** Needs Attention shows a case 90 days before its deadline ("Within 90 days") and again, highlighted, 30 days before ("Within 30 days"). The red warning in the last 5 days stays
- **Charge 720 ILCS 550/4(b), subsequent offense** (Class A misdemeanor) next to the first offense (Class B); picking it fills in the right class
- **Arrest Report phone calls have a Time of call**, on the PDF and in `{{arrest.phoneCalls}}`
- **Print / PDF, Save PDF to Case and Send to Sign** first list what is still empty in the Arrest Report (name, arrest date and time, Miranda, narcotics, warrant, vehicle, phone call, narrative, arresting officer). **Go Back** to fill it in, or **Continue Anyway**. A part ticked as not applying isn't listed
- **Closed Files and Archived** case cards show when the case was closed (and archived)

## What's new in v1.134

- **Statute of limitations, 18 months for misdemeanors:** a case whose narcotic charges are all misdemeanors (for example 720 ILCS 550/4(b) or (c), or any charge marked Misdemeanor or Class A, B or C) now gets 18 months from the Date of Occurrence instead of 3 years. One felony narcotic charge keeps 3 years. A charge whose class isn't known counts as a felony. The warning in Needs Attention says which period applies
- **Closed Files and Archived, by year:** each has a folder for every year. Closed Files uses the year a case was closed (a closed Mission, the year it ended); Archived uses the year it was archived. Open a year for its folders: the Missions and General Files in Closed Files, the reasons (EXPIRED, NOLLE PROSEQUI, PROSECUTION, Other) in Archived. Open one of those for its case numbers
- **No double count:** a folder shows its number of case numbers once, on the folder; the name under it no longer repeats it ("OP-1 Example · 1 closed" is now "OP-1 / Example")
- **Other Files** now sits under Archived, then the Secure Locker

## What's new in v1.133

- **Arrest Report → Phone Calls:** for each call, **Name (called who)**, **Relationship** and **Phone number called** (+ Add Phone Call for more than one), or tick **Refused phone call**. The PDF has a PHONE CALLS part with the calls in a table, or "ARRESTEE REFUSED PHONE CALL". In templates, `{{arrest.phoneCalls}}` gives the calls one per line (or "Refused phone call")
- **New charge:** 720 ILCS 550/4(b), Possession of Cannabis, 10 to 30 grams, first offense (Class B misdemeanor), under Illinois: Possession in the charge list and the Reference

## What's new in v1.132

- **Typing is smoother on a slow laptop.** After each pause in typing, CaseVault used to redraw the whole case list on the left, which on a slower PC froze the page for up to a second. Now it redraws only what changed (often just one row), and a save waits until you have paused for a moment (1.5 seconds)
- **Saving While You Type** (⋮ → Options → Display), set for each PC: **After a pause** (recommended), **Every 5 minutes** or **Every 30 minutes**. With 5 or 30 minutes the save icon at the top says when the next save is; **Ctrl+S** saves at once. Changing page, locking, Power Off or closing CaseVault always saves first, and a change made with a click (Add Note, a choice from a list) saves straight away. With 30 minutes, up to 30 minutes of typing can be lost if the SSD is pulled out or the laptop loses power

## What's new in v1.131

- **Find (Ctrl+K):** one box for everything. Type a case number, a name, words from a case's notes, a Mission or a page (General Files, Settings, Back Up the Vault, New Case…) and press Enter. For a name it also offers **Every case this person is on** (the person view) and **Search inside cases** (notes, timelines, reports, the Draft form and file names). ↑ ↓ move, Enter opens, Esc closes. The sidebar's own search is still on its magnifier
- **Shortcuts:** press **?** (or ⋮ → Keyboard Shortcuts) for the list; Find's footer reminds you
- **A Mission's case list:** the Closing column says it in a few words (No report yet, Report ready, Other RD report, Closed by arrest); point at it for the full sentence

## What's new in v1.130

- **A Mission's case list:** each row is one line again. **Open ▾** on a row shows Details, Reports and Files for that case; the Closing note fits on one line
- **Long tables** (General Files, Missions, a Mission's cases, Files) keep their column headings at the top while you scroll, and rows are lightly striped so a line is easy to follow
- **Home banner:** the count chips are flatter and quieter
- **Sidebar:** INDEPENDENT CASES no longer runs under its count when there are 10 or more cases; it wraps onto two lines when it needs the room

## What's new in v1.129

- **Tidier spacing:** every inner margin in CaseVault now sits on the same small grid, so cards, forms, tables and buttons line up the same way on every page
- **Flatter:** the many slightly different shadows are now two: a faint one on cards and a stronger one under windows and panels that float
- **Colours:** older one-off reds, greens, ambers and blues now use the theme's colours, so warnings, errors and "done" look the same everywhere, in light and dark

## What's new in v1.128

- **Opened date in the future:** a case whose Opened date is still to come (usually a typo) now says so: General Files shows "in 40d" with a warning sign, and the case's hover box in the sidebar says to check the date. It used to show "Today"
- **Backup reminder:** when the full backup to a second drive is due, a slim line under the home page banner says so, with **Back Up Now**; × hides it for the day. It no longer floats over the page and hides the buttons underneath. The banner's backup chip still turns red after 7 days
- **Links** are no longer underlined anywhere; they are in the link colour

## What's new in v1.127

- **One icon style:** every picture in CaseVault is now a colour icon. The last three that were plain outlines (the numbered list on the sidebar's sort button and Arrange, the # on Case Numbers, the U.S. Marshals star) have colour versions in the same style
- The small controls (the open/close arrows, the drag grip and the ⋮ menu) stay simple shapes, all in the same soft grey, so they don't compete with the pictures; they turn the button's colour when you point at it

## What's new in v1.126

- **PDFs match the app:** the Supplementary Report, Draft PDF, Arrest Report, Case Summary, Timeline PDF and Buy Summary, Discovery receipt and Link Chart have navy titles, and their section headers (and the Arrest Report's side tabs) are light navy with navy writing. The grey label boxes and black writing are unchanged, so a copy still prints clearly in black and white

## What's new in v1.125

- **Text sizes:** every screen now uses the same six text sizes (page title, section, sub-section, body, small, tiny) and three weights (regular, semibold, bold). Headings, labels and hints look the same from page to page
- Small print (hints, dates under a case, the case list in the sidebar) is a touch larger and easier to read; nothing is cut off

## What's new in v1.124

- **New look, "Navy Ledger":** deep navy on a warm off-white, flatter (thin borders instead of shadows), with a navy welcome banner. Dark mode has the same colours in lighter tones
- **Font:** JetBrains Mono, which comes with CaseVault, so the app looks the same on every PC (Consolas was only on Windows). Nothing is downloaded
- **Status colours mean the same everywhere:** Open blue, Pending amber, Closed green, Archived warm grey, Overdue red. Mission sections are blue and General Files plum

## What's new in v1.123

- **Quick Links:** one link per row, every link the same size, and the whole name on one line
- **Missions list, a Mission's page and General Files:** the status labels (Open, Closed, Archived) are all one width, and dates sit in columns, months under months, days under days, years under years
- **A Mission's page:** the subject is split into **Last Name**, **First Name** and **M.I.** columns, as in General Files. On a smaller screen the Details / Reports / Files buttons stack, so the table fits without scrolling sideways

## What's new in v1.122

- **Housekeeping release:** nothing changes in how CaseVault works. The unused Poppins font files are gone (CaseVault uses Consolas), the older "What's new" notes moved to [previous-versions/WHATS-NEW.md](../previous-versions/WHATS-NEW.md), and the README describes the current screens (Settings, the Quick Links panel, the person view)
- The check that stops case files being committed to the public code repository now also covers locker, chat, branding, export and log folders and the arrest, link chart, mail log, library and report-field files

## What's new in v1.121

- **Quick Links** are in a panel that slides in from the right. Open it with **Quick Links** on the home page (beside Reference) or the link icon in the sidebar's top row (next to Home), from any page. Reference / OSINT / LEO tabs and **Arrange** work as before. A link to a CaseVault page (Location Codes, Charges…) shows that page and closes the panel; outside sites open in a new browser tab. Close it with ×, Esc or a click outside. The bar at the bottom of the page is gone
- **Settings** (gear, on the home page) is the window that was called Vault, with the Library in it: My Profile, Letterhead, Library, Templates, Quick links, mail, logs and backups. Where this guide says "Vault → …", look in Settings
- **Sidebar:** no Closed / Archived area at the bottom. Closed and archived cases are on the home page (**CLOSED FILES** and **ARCHIVED**). A search in the sidebar's search box still finds them: they are listed under **Closed** and **Archived** below the open cases

## What's new in v1.120

- **Landing page:** the **Secure Locker** section is now below **Archived** (Other Files, Closed Files, Archived, then Secure Locker)

## What's new in v1.119

- **Timeline → Type "Buy":** a buy has its narcotic (pick or type), amount (g, kg, oz, lb, pills or units) and the money paid, shown on the event ("Cocaine · 3.5 g · $200")
- **Buy Summary** (above the timeline): each suspect's buys in their colour, with the narcotic totals and money paid; **PDF** makes it a page to print or save to the case. With a suspect picked in the key, only theirs
- **Print Timeline:** a PDF of the events shown now (the filter and suspect you picked), each with its colour square, followed by the buy summary of those events
- **Person view:** the person button beside a suspect on the Details tab (and beside a name in the Buy Summary) lists every case they are on, with their role there, the Mission, and their timeline events. Names written another way are listed under "Possibly the same person"; check before treating them as one
- **Mission page:** "N of M cases closed" with a bar, and a Closing column: Arrest report ready, Can close by arrest with RD …'s report, No arrest report yet, or Closed
- **Arrest tab → Copy From Another Case:** pick an arrestee already entered on another case number of the Mission. Their name, residence, date of birth and description are copied with this case's RD number; the charges, property and narrative stay with the other case
- **Unsaved mark:** a small amber square on a tab while its changes are waiting to be written to the SSD; it goes away once saved
- **Fixes:** Quick Links' slim bar shows whole links only (**More +N** says how many more); messages rise above the bar and the round buttons sit in its right end; the Memory icon shows with the others; on the Details tab the Status hint is one line, the Closed date appears once the case is closed, and the Mission is named once (in the header); the Mission table's columns all have headings

## What's new in v1.118

- **Quick Links** (bottom of the page) is now one slim row: the Reference / OSINT / LEO tabs and that tab's links side by side (scroll sideways for more). **More** opens the full panel with Arrange; **Less** goes back. Remembered on this PC
- **Sidebar:** CLOSED and ARCHIVED sit side by side in one small row, with their counts. Click one to open its list (the panel grows); click again to fold it
- **Letterhead:** on the Draft, Arrest and Link Chart tabs it is one line (logo and the first line of the header) with **Edit Letterhead**. It is also in Settings → My Profile, under Letterhead
- **Landing page:** a section with nothing in it (no closed cases, nothing archived, no open Mission) is a single header line
- **Details tab:** Suspects, Contacts, Deconfliction, Case History and LEO Partners show how many entries they hold beside their titles, so you can see without opening them
- **Top bar:** each status icon has a caption under it: Network, Local AI, Memory, SSD and Power Off
- **Files tab:** the line above the files says the folder in words ("2 files in Photos"); point at it for where it is on the SSD
- **General Files:** the Mission column shows the Mission's number; point at it for the name
- **Messages** that stay a few seconds have a × to close them. The once-a-day backup reminder is a shorter amber note; the banner's **No Backup** chip keeps showing it
- The round buttons in the corner (Top, Ask AI, Notes) are a little smaller, and hover boxes that only repeat a button's own words no longer pop up

## What's new in v1.117

- **Timeline → Suspect and Colour:** each event can say which suspect it is about (pick from the suspects of every case number of the Mission, or type a name) and take a colour (ten to pick from, or none). Picking a suspect gives the event that suspect's colour; a new suspect gets the next free one. The event's edge, marker and suspect tag are in that colour
- **Timeline → Suspects key** (above the list): each suspect with their colour and how many events. Click a name to see only that suspect's events (**Show All** to go back); click the colour square to change it on all their events at once
- The small timelines on the **Details** tab and the **Mission** page show each circle in its suspect's colour, and the suspect in the hover box
- **Draft → Offenders → Add From Suspects:** the popup lists Name, Role and In Report in their own columns, so Primary, Secondary and Other line up

## What's new in v1.116

- **Landing page → CLOSED FILES** (under Other Files and the Secure Locker): a grey folder for each closed Mission (with all its case numbers), one for each Mission still going that has closed case numbers ("OP-1 · 1 closed"), and one per year for closed cases not in a Mission. Click a folder to see its cases; the Mission's name links to its page. **All Closed** lists every closed case
- **Landing page → ARCHIVED** (under Closed Files): a folder for each archive reason (EXPIRED, NOLLE PROSEQUI, PROSECUTION, and Other). **All Archived** lists every archived case
- **Mission Files** and **General Files** on the landing page now show open work only: a closed case or a closed Mission moves to CLOSED FILES, and comes back when reopened. The sidebar is unchanged

## What's new in v1.115

- **Close by arrest, one arrest report for several RDs:** closing by arrest still needs an arrest report (an arrestee and a charge), now for each case number ticked. A case number without Arrest Details of its own can point to the RD that has them: choose it in **Arrest report on RD** (it lists the Mission's case numbers and the same-suspect cases that have an arrest report, newest arrest first, and is set to that one already). Close then passes
- Each case number closed this way keeps "Arrest report: see RD …" in its closing note and on its Details tab, and its **Arrest** tab says where the report is, with a button to open it. `{{closure.arrestRd}}` gives that RD in templates
- **Close Mission** checks every case number ticked, not only the first one

## What's new in v1.114

- **Arrest Details → Charges:** each charge is a box on two lines: Offense as cited, Class, Type and Counts, then Charge and Victim. Picking an Offense as cited or a Charge from the list fills in the other one and its **Class** and **Type** (for example 720 ILCS 570/402(c): Class 4, Felony). Federal charges come in as Felony. Where the statute alone doesn't set the class, only the Type is filled. Check the class against the amount and the arrestee's record (a repeat offense can raise it) and change it if needed
- **Class** has a list (Class X, 1, 2, 3, 4, A, B, C, Petty offense, Federal felony, Federal misdemeanor), or type your own. Picking one sets the Type (Felony or Misdemeanor)
- **Victim** on a charge: the arrow lists the victims on the Draft tab and on sent reports whose **R.D. Number** is the arrestee's RD # (Report Numbers), then the victims on this arrest, then the State of Illinois. You can still type a name
- **Properties:** **+ Add Property** adds a row with **Inventory #** and **Description**; pick Prisoner Personal Property, Prisoner Jewelry, Prisoner Money or Prisoner Other, or write your own. The Arrest Report PDF lists them in a table. Text written in the old Properties box before v1.114 stays, under the rows

## What's new in v1.113

- **Arrest Details → Show All / Hide All** (top right) open or fold every part, as on the Draft tab
- **Arrest Details → Charges:** when an arrestee has no charges typed yet, the Draft tab's charges fill in by themselves when the tab opens (once: charges you remove don't come back). **Use Report Charges** still adds any new ones
- **Arrest Details → Offender → Pick from Suspects:** lists the suspects on the Details tab and the offenders on the Draft tab (one line per person). Picking one fills Last, First and Middle name, date of birth, sex, race, height, weight, eyes, hair, complexion, residence, phone, IR # and CB # from what is there. Check them before printing. Age now shows even before the arrest date is in (counted to today)
- **Arrest Details → Recovered Narcotics, Warrant, Arrestee Vehicle:** tick **No narcotics recovered**, **No warrant identified** or **No arrestee vehicle information** when it doesn't apply: the boxes fold away (what was typed is kept) and the PDF prints NO NARCOTICS RECOVERED, NO WARRANT IDENTIFIED or NO VEHICLE
- **Arrest Details → Victim and Complainant → + Add State of Illinois as Victim** (or pick *State of Illinois* in a person's Name): only Role, Name and **Officer name** are asked, and the PDF prints the State of Illinois with the officer's name

## What's new in v1.112

- **Home page → SECURE LOCKER:** the Secure Locker has its own section (below Archived since v1.120): click its **Secure Locker** tile or **Open Locker**. (In v1.111 it was a tile and a button inside Other Files.)
- **Home page → GENERAL FILES:** when every case is in a Mission, General Files still shows a folder for this year, greyed out. Open it: it says it is empty, and New Case is there

## What's new in v1.111

- **Secure Locker** (home page → **SECURE LOCKER** section, below Archived):
  - **The first time**, choose a locker password (at least 10 characters; not your PIN). CaseVault then shows a **recovery key** once: Print it or write it down, keep it away from the SSD, tick the box and click Done. Nothing is made until you do.
  - **Password Manager**: Add Password (Site / System, Username, Password, Web Address, Notes). **Generate** makes a strong 20-character password. In the table the password shows as dots: the eye shows it for 20 seconds, Copy copies it and clears the clipboard after 30 seconds. Search finds any word but the passwords.
  - **Confidential Files**: Add Files (or drop them on the list) for informant files and anything else to keep locked; each is encrypted on the SSD. Give each an **Informant / Label** (CI-1234) with the pencil. Click a name to read it (PDF, pictures, text); other files, or **Save a Copy**, go to Downloads *not encrypted*: delete them when done. The original you picked is not deleted: delete it yourself.
  - **Covert**: Covert Aliases (alias name, date of birth and address used, ID number, phone, email, backstory) and Covert Accounts (platform, handle, password, the alias it belongs to, phone, email, notes).
  - **Lock** locks it now; it also locks when you leave the page, after 5 minutes without use, with the privacy screen and when the SSD is unplugged. **Change Password** needs the current one; **New Recovery Key** makes a new key (the old one stops working).
  - **Forgot the password?** on the locked page: type the recovery key and a new password.
  - Kept in `CaseVault-Data\locker` (locker.json, data.bin, f-…bin), encrypted: a copied SSD or a full backup shows nothing readable. Without the password and the recovery key nobody, you included, can open it.
- **Details tab → Field Notes:** the case's Field Notes, formatted, under the timeline. **Edit** opens the Field Notes page; **Notes Box** opens the floating box. On a **Mission's page**, the Field Notes of each case number that has some, under the Timeline
- **Close Case → Other open cases on the same suspect:** CaseVault lists the other open cases whose Subject Name or an identified suspect is the same person (*DOE, John* = *John Doe*; a middle initial left off still matches, so check). None is ticked; tick the ones to close with this disposition and date. Each gets *Closed together with EX-100 (same suspect: John Doe)* in its closing note, and each can be reopened on its own. Cleared by arrest gives each an Arrest details tab
- **General Files:** Last Name, First Name and Middle Name columns (left aligned; *John Michael Doe* and *DOE, John Michael* both read DOE | John | Michael). Something that isn't one person's name (*State v. Doe*, a crew) stays whole across the three columns. Sort by Last Name or First Name

## What's new in v1.110

- **Draft → Offense → IUCR Code:** the list is written out (*2015 Manufacture and Delivery: Hallucinogen*, *2025 Possession: Hallucinogen*, *1811 Possession: Cannabis, 30 Grams or Less*…); search by code or by any word. Reference → UCR shows the same wording
- **Offense Classification follows the IUCR code:** pick (or type) a code and its wording goes in Offense Classification, also on the PDF and the report sent to Reports. Adding charges afterwards doesn't replace it. To use a charge's wording instead, pick it from Offense Classification's arrow (the IUCR wording is first in that list, then each charge's Statute Description). Emptying the IUCR Code puts the charge's wording back. A Draft form saved before with the old short wording (*Delv: Hallucinogens*, *Poss: Cannabis 30 grms or less*…) shows the written-out wording when it opens; wording you typed yourself, a charge's wording, and reports already sent are not changed
- **Offense layout:** Offense Classification and IUCR Code on the first row, Address of Occurrence and Location Code on the second, Type of Location and Date on the third, then Time and the two Beats; the long boxes are two columns wide so nothing is cut off

## What's new in v1.109

- **Draft → Offense → Address of Occurrence:** the list is *99 N Confidential Street* and *99 S Confidential Street*
- **Draft → Offenders, Victims and Charges:** pick *See DEA 6 for further information* from an offender's or victim's Name list, or from a charge's Statute list (or type it). That entry then shows only that one box, which is enough for the part's green check. Change the words and the other boxes come back (anything typed in them before is still there). On the PDF it is one line
- **Draft → Narcotics Recovered:** the Narcotics Type list has no doubles: the calculator's names (*Marijuana (Domestic)*, *Cocaine (Powder)*, *Heroin (Tan)*…) once each, then *PCP* and *Other Controlled Substance*. A type typed before stays as it was

## What's new in v1.108

- **Draft → Offense → Address of Occurrence:** click the box (or its arrow) and pick *99 N Confidential* or *99 N Confidential Street*; any other address can still be typed
- **Draft → Victims:** the Name list offers the *Federal Government* as well as the *State of Illinois*. Both show only Name, Relation Code and Officer Name (the State fills Relation Code 024; the Federal Government leaves it for you)
- **Draft → See DEA 6** (next to Clear All): for a report kept for statistics only. Victims, Offenders, Charges and Evidence Inventoried open on screen and read *See DEA 6 for further information* in their grey boxes (a list that already has an entry keeps it; no exhibit number is used, the words go in an Evidence Note), and the Summary of Investigation becomes: *This report is for statistical purposes only. For further information see DEA 6 reports under Federal Case Number (the case's Federal Jacket Number). THIS CASE IS CLEAR/CLOSED.* The Offense Classification is left as it is. **Undo** on the message puts the form back. Then Print / PDF or Send Draft to Reports as usual

## What's new in v1.107

- **Banner:** the backup chip says *Backed Up*, *Backup: 9d* or *No Backup* (point at it for the full sentence); no chip clips its words at any window width
- **Details tab → Timeline:** the circles of the case number you have open glow green; the other case numbers of the Mission stay blue. The green key next to *Timeline* names the case number. (The home page's Mission timeline has no green: no case is open there)
- **Draft → Evidence → Put in Date Order:** exhibit numbers run on across every case with the same federal jacket number, in the order they were entered. If a case dated earlier was entered later, click **Put in Date Order**: CaseVault lists each case by its Date of Occurrence (or opened date) with *old → new* numbers; **Renumber** applies it and renames the exhibit photos and PDFs (Exhibit 2a…). Reports already sent keep the numbers they were sent with, and an exhibit number typed into a narrative is not changed. Archived cases are read-only and left as they are

## What's new in v1.106

- **Delete Case → Recently Deleted:** a deleted case waits 30 days in Settings → **Recently Deleted** (`CaseVault-Data\deleted`). **Restore** puts it back where it was (cases or the archive; its Mission too, made again if needed). **Delete Now** removes it for good. After 30 days CaseVault empties it by itself the next time the vault opens
- **Settings → Backups → Restore Cases…:** pick a `CaseVault-Backup-<date>` folder from a full backup (the browser asks to "upload" it: nothing leaves the PC, it only reads the files). Tick the cases to bring back and click **Restore**. Each comes back with its notes, timeline, reports and files; one that is in the vault now goes to Recently Deleted first. The files are copied in full before the case appears, so an interrupted restore never leaves half a case
- **Search Inside Cases:** type in the case list's search box, then press **Enter** or click **Search Inside Cases** under it. It reads every case's notes, timeline, reports, Draft form, arrest details, suspects, contacts and file names; every word has to be in the same place. Click a result to open that tab
- **Add Follow-up** (Details → Case actions, for an Open case): pick what you're waiting on, add details and the date; it goes on the Timeline as *Follow up: Lab results — …*
- **Privacy screen:** the PIN is now stored with PBKDF2 (600,000 rounds) instead of one SHA-256, so a copied vault.json can't be guessed quickly; an older PIN still works and is upgraded the next time it unlocks. Text you copied from CaseVault is cleared from the clipboard when the screen comes on (always with Hide; with the idle timer when the window is in front)
- **Look:** Open blue, Closed slate grey, Archived purple on every status label, the banner and the sidebar's left edge; the banner chips are the same width; empty lists show an icon and a hint; every section heading is in capitals; grey hint text is darker; the keyboard focus has a clear blue outline

## What's new in v1.105

- **No more Pending.** A case is Open, Closed or Archived; a Mission is Open or Closed. The Pending option, its hourglass icon, the Pending box in the banner and the Pending filter in General Files are gone. Cases and Missions that were Pending are Open again the first time v1.105 opens the vault; their follow-up deadlines stay on the Timeline, and each case's history notes the change. Waiting on a lab or the DA? Keep the case Open and put the follow-up date on its Timeline. (The Draft's **Court Date → Pending** box is unchanged: it means the court date isn't set yet.)

## What's new in v1.104

- **Draft → Evidence → Add Photos or PDF:** an exhibit (or an Additional Exhibit) can have PDFs as well as photos. Pick one or more in the same window. A PDF gets the next letter (1b, 1c), shows its first page with a red **PDF** badge, and has a label box like a photo. Every page of it goes into the report's Exhibit Attachments, captioned with the page (*page 2 of 3*). The ✕ takes it off the exhibit; the file stays in the case files

## What's new in v1.103

- **Home page → a Mission folder:** the timeline is now the slim line with small circles from a case's Details tab (one circle per event, close ones grouped with a count, red when overdue, a red Today mark), with no sideways scrolling. Point at a circle for the details; click it to open that case's Timeline tab. This replaces the vertical list from v1.102
- **Back up to C:\CaseVault-Backups (Firefox, helper 1.15):** **Back Up Everything** → **Add Backup Folder** (the box is open and says `C:\CaseVault-Backups` until a folder is added) → **Add** → pick it → **Back Up to This Drive**. The folder is made if needed, its drive's BitLocker is shown, and the backups go straight into it. A shared folder on another PC (`\\BEELINK\CaseVault-Backups`) still works the same way

## What's new in v1.102

- **Back up to another PC (e.g. a Beelink):** Settings → Backups → **Back Up Everything** → **Add Network Folder** → type `\\BEELINK\CaseVault-Backups` → **Add**. Pick it (globe icon) and back up. The first time, tick that the PC is encrypted and the folder is only yours. Off or unreachable: greyed out. **Remove** takes it off the list and leaves its backups there. In Chrome or Edge, map the folder to a drive letter (Z:) and pick that. Set up the other PC first: [BACKUP-TO-ANOTHER-PC.md](BACKUP-TO-ANOTHER-PC.md)
- **Home page → a Mission folder:** its timeline is now the vertical one from the Timeline tab (month headings, date boxes, cards, the red Today line) instead of a strip you scroll sideways. Click an event to open it on its case's Timeline tab
- Links no longer underline when the mouse is over them; they turn blue

## What's new in v1.101

- **Draft → Next Missing:** after Save Changes, the red **Next Missing (N)** button (left of Save Changes) jumps to the first blank field, then the next one each time you click. A folded part opens by itself. N counts down as you fill fields in, and the button goes away when nothing is blank
- **General Files:** the **Age** column says how long ago each case was opened. Click a column heading (Case Number, Subject Name, Opened, Age) to sort; click it again to reverse. The arrow beside the heading shows which way
- **Sidebar order:** the list icon at the top of the sidebar (after Hide) switches the case lists between *By case number*, *Oldest opened first* and *Newest opened first*. It applies to Mission folders and Independent Cases, and this PC remembers it
- **INDEPENDENT CASES** in the sidebar: the bell for a deadline now sits on the folder's corner, and the line under the name just says how many cases
- **"No full backup yet"** pops up at most once a day. The **No Backup** chip in the banner stays until you back up

## What's new in v1.100

- **Sidebar:** each case shows when it was opened, under its Subject Name: the date and how long ago (*today*, *5d* days, *2mo* months, *2y* years). Point at it for the full date and the exact number of days. Cases in a Mission folder show it too
- **Draft → Save Changes:** if a part still has no green check, its blank fields are outlined in red so you can see what's missing. An empty list (no charges, no personnel) or *No evidence yet* is outlined too. The message after saving says how many fields are blank. Fill a field and its outline goes; untick a part that doesn't apply and its outlines go. Nothing is outlined before you click Save Changes

## What's new in v1.99

- **Home page banner:** the backup reminder is now a chip in the row of counts, right after **Overdue**, so the reminders are together. It reads **No Backup** (never backed up) or **Backup 9d Ago** in red once a full backup is more than 7 days old, and **Backed Up Today** / **Backup 3d Ago** otherwise. If the SSD has no BitLocker, a red **Not Encrypted** chip follows it. Point at a chip for the details; click it for Settings → Backups

## What's new in v1.98

- **Is the SSD encrypted?** In Firefox (with the helper), CaseVault asks Windows. If the CASEVAULT drive has no BitLocker, the home page shows a red **Not Encrypted** chip and a warning at startup. Click the chip for Settings → Backups, which says how to turn BitLocker on. If BitLocker is paused, it says so and how to resume it. Chrome and Edge can't ask Windows, so there the Backups page says to look for the padlock on the drive in File Explorer
- **Back Up Everything** lists each drive as **Encrypted (BitLocker on)** or **Not encrypted**. Picking one without BitLocker asks first, because the backup is a full copy of every case: **Cancel** (the default) or **Back Up Anyway**
- **[SECURITY.md](SECURITY.md)** explains what keeps your cases safe, the BitLocker settings to use, and the GitHub settings that protect the code
- Behind the scenes: the update checks are stricter (browser tests must pass before anything is published) and the code is split into smaller files. Nothing else changes on screen. The helper is now **1.13**: copy the new `casevault-helper` folder to `W:\`

## What's new in v1.97

- **Subject Names line up as LAST, First** in the sidebar, General Files, Mission folders, Needs Attention and at the top of a case: "John Doe" shows as **DOE, John**, "Mary Ann Roe" as **ROE, Mary Ann**, "John Doe Jr" as **DOE, John Jr**. Nothing is changed in the Subject Name box. One-word names, "Unknown Offender", "Not Identified", case captions ("State v. Doe"), group names and names with numbers show as you typed them
- **Details → Timeline line:** events on the same day, or a day or two apart, no longer sit on top of each other. They share one marker with a number (how many); point at it for the list, click it to open the Timeline tab

## What's new in v1.96

- **Details → Deconfliction is in date order**, oldest check first; checks with no date go last. When you change a date, the check moves to its place after you click outside the Deconfliction list, so it doesn't jump while you type. **Add Deconfliction** puts the new check (today's date) where it belongs and takes you to it

## What's new in v1.95

- **Offense Classification = a charge's Statute Description, exactly.** Older drafts are corrected the moment they open (the first charge's wording), and the PDF always prints the charge wording. To use another charge's wording, pick it from the arrow on the Offense Classification box. Wording that isn't a charge's goes back when you leave the box. If the Charges list is ticked off, the box keeps what you type

## What's new in v1.94

- **Draft → Offenders → Offender Vehicle(s):** click **Add Vehicle** on an offender for each car: Year, Make, Model, Color, License Plate, Plate State, VIN, Registered Owner, and tick **Impound**, **Tow** or **DNA** (Does Not Apply) — ticking one clears the others. **Add Another Vehicle** for the next one; the trash can removes one; **No Vehicle** hides them all
- The offender's old Vehicle / VIN / Plates boxes and the separate **Vehicles** list in the Officer's Report are gone; anything entered there is moved onto the offender's vehicles the first time the Draft opens
- On the PDF each vehicle is a line under its offender

## What's new in v1.93

- **Victim: State of Illinois** gets Relation Code **024** by itself (you can change it); the PDF line reads *State of Illinois · Relation Code: 024 · Officer Name*
- **Offense Classification** takes the exact wording of the first charge's **Statute Description** when you pick or type the charge; picking an IUCR code no longer replaces it, and the box's arrow lists every charge's Statute Description. Your own wording is never overwritten
- **Officer's Report green check:** an empty list that is still ticked in (no Police Personnel, no charges…) stops the check; untick the list when it doesn't apply
- **Details → Suspects** stay in order: Primary, then Secondary, then Other. Change a role and the card moves; a new suspect lands in its role's place
- **Draft → Offenders → Add From Suspects** opens a list: tick the suspects for this report (Primary ones start ticked; ones already in the report are marked), then **Add to Offenders**

## What's new in v1.92

- **Draft → Court Date → Pending:** ticking Pending no longer unticks the Court Date line itself (it happened in Firefox)
- **CB Number can be DNA** (Does Not Apply): pick it from the arrow on an offender's CB Number on the Draft tab, or on the Arrest tab's CB # and IR #

## What's new in v1.91

- **CaseVault is offline only.** The optional online AI (Claude, Gemini and OpenRouter: the Online button in the header, the online research page and the API keys in the Vault) is gone. The page may now only talk to the AI engine on this PC
- **No in-browser AI.** The small fallback model that ran in the browser (WebLLM) is gone. Start CaseVault with `W:\Start-CaseVault.bat` so the local AI engine (Ollama) runs; without it, Checks still run their rule-based checks
- If an older version saved an online AI key on the SSD (`CaseVault-Data\secrets`), it is deleted the first time v1.91 opens the vault, and a message says so once
- The header's green **Offline** shield stays, as a reminder that nothing leaves the PC
- Department mail is unchanged: the review screen before an Outlook draft, and the Outbound Log
- **Helper 1.12** (copy `tools\casevault-helper\` to `W:\casevault-helper\`): no longer serves in-browser models. You can delete `W:\webllm` and `W:\Get-WebLLM-Model.bat` to free the space

## What's new in v1.90

- **Back up before Power Off:** when the vault hasn't had a full backup in over a week (or ever), Power Off asks first: **Back Up First** opens Settings → Backups, **Power Off Anyway** carries on
- **Undo after Clear All** on the Draft tab, as after Send to Files
- **Change a Case History note:** click the pencil beside it to change its date or words (Enter saves, Esc cancels); × deletes it
- **Search finds Case History notes:** Ctrl+K and type a word from a note, e.g. "migrated"
- The README shows the current version only; earlier versions are listed in the `previous-versions` folder

## What's new in v1.89

- Send to Files clears the Draft by itself once the PDF is saved; the toast has an Undo button that brings the Draft back
- The floating Draft bar (Send to Files, PDF View...) now sits right under the top toolbar, with no gap
- Case History: the date and the entry have their own columns, so nothing runs together. "Opened as Open" now reads "Added to CaseVault (Open)", and when the Opened date on the Details tab is earlier there is a "Case opened" row on that date
- Case History: **Add Note** with its own date (for example "Case started on paper; migrated to CaseVault"); notes sort by their date, show on the Case Summary PDF, and can be deleted with ×
- Details: the Case Officer name in Contacts uses the same font size as the other boxes
- Files preview of a PDF uses CaseVault's own square viewer (zoom % and page boxes square, no rounded browser controls)
- Keyboard shortcuts: every key box is the same width and height
- Clean-up: about 60 unused style rules and an unused date function removed

## What's new in v1.88

- Quick Links and the CLOSED FILES / ARCHIVED area: one fixed height, five Quick Links tiles high; the drag bars and padlocks are gone
- CLOSED FILES and ARCHIVED scroll as one list, and when the scrolling stops the top card is shown whole (never cut off at the top); the headings scroll with their lists

## What's new in v1.87

- **Back Up Everything in Firefox** (needs helper 1.11): CaseVault lists the other drives (not the SSD's own partitions or the Windows drive), the helper copies the whole CaseVault-Data folder to `<drive>\CaseVault-Backups\CaseVault-Backup-<date>` and checks every file's SHA-256 against the original, in the background with a progress count; the banner then shows the backup as checked. With an older helper the File Explorer steps still show
- Helper 1.11: new `backup-drives`, `backup-start` and `backup-status` calls; a backup can only go to one of the drives it lists

## What's new in v1.86

- Supplementary Report PDF, Officer's Report:
  - **Victim**: a State of Illinois victim and the Officer Name on one line
  - **Narcotics Recovered (Total Weight & Value)**: the narcotic, the amount, then Street Value and Purchase Price under each other
  - **Pre-Recorded Funds**: a table with QTY (two digits), Denomination ($20.00) and each Serial Number on its own line, then Recovered or Not Recovered
- The Officer's Report has no IR Number line any more: the IR Number is in each offender's info (one typed there before goes to the first offender without one)
- Submission and Approval: untick **Secondary Reporting Officer** when there is none; the name, star and signature boxes then come off the PDF

## What's new in v1.85

- **Back Up Everything** (Settings → Backups): copies the whole CaseVault-Data folder to a second drive and checks every file byte for byte (Chrome or Edge; in Firefox it shows the File Explorer steps and records the date). The banner shows when the last full backup was, red after 7 days, and a reminder appears at start-up
- Restore a vault.json backup from the Backups list (the current one is backed up first)
- Start-up checks: today's vault.json backup, the last full backup, and free space on the SSD (Firefox)
- A Mission is Closed only when its cases are: **Close Mission** is on the Mission page (each open case gets a disposition), with **Reopen Mission** when it is closed; the Edit form refuses Closed while a case is open
- The sidebar's GENERAL FILES folder is now **INDEPENDENT CASES** (the cases not in a Mission); General Files is still the page with every case
- Pending and Inactive explained where you choose them; the Closed date on the Details tab is filled in by Close Case, not typed
- Delete Case asks twice; the last question comes with a skull and crossbones
- **Report a Problem** (⋮ menu): the app version, browser and recent errors with case numbers, names and Missions taken out, saved to the SSD or copied, to send with Contact Dev
- **Case History** on the Details tab: each status change, closing, reopening, archiving and Mission move, with the date and time
- **Case Summary** (Case Actions): one PDF page for a supervisor with the case, arrestees and charges, exhibits, timeline and history; Save PDF to Case puts it in Files
- Keyboard shortcuts: Ctrl+K search, N new case, ? the list (also in the ⋮ menu)
- **Department letterhead**: a square for the department logo (click to add it) and the Department Header beside it, at the top of the Draft, Arrest and Link Chart tabs and across the top of their PDFs; one letterhead for every case, kept on the SSD
- Templates, the Checks tab and the Document Anonymizer are marked Beta
- Removed: the second Restore button on archived cases and Close Mission on each case's Details tab

## What's new in v1.84

- CLOSED FILES and ARCHIVED always sit at the bottom of the sidebar; drag the bar above them to make that area taller or shorter, and lock it with the padlock (double-click the bar to reset)
- Quick Links: drag the bar above them to change their height, and lock it
- Closing needs a disposition; closing by arrest needs the arrest report (an arrestee and at least one charge) first, with a button to open the Arrest details tab
- Archiving needs a reason: EXPIRED, NOLLE PROSEQUI, PROSECUTION, or Other with the reason written in; the reason shows on the archived case
- After closing, the message has Undo for a few seconds
- Closing the last open case of a Mission asks whether to close the Mission too; reopening a case of a closed Mission asks whether to reopen the Mission
- A closed case stays in its Mission's folder, greyed with a padlock, under the open ones; in CLOSED FILES it is listed under the Mission's own name
- The Status drop-down offers Open and Pending; closing and archiving use their buttons
- Banner: glass status boxes with a colour edge, a red Overdue count, and each count opens General Files showing just those cases

## What's new in v1.83

- **CLOSED FILES and ARCHIVED** in the sidebar now look like MISSION FILES and GENERAL FILES: a card with the folder icon, the name in capitals with a line under it (how many closed or archived cases), the count and the arrow. The CLOSED FILES count is the number of closed cases, the same as the banner.
- **+ on GENERAL FILES** starts a new case, like + on MISSION FILES starts a new Mission.
- **Recently Updated:** the status boxes (Open, Pending, Closed, Archived) are all the same width.
- **Reopen a case:** the message shows the closing date written out ("October 04, 2026").

## What's new in v1.82

- **Sidebar folders stay as you left them:** a folder you open or fold (MISSION FILES, a Mission, GENERAL FILES) stays that way until you click it again, even when you go to another page.
- **All Files for a Mission:** on a Mission's page, **All Files** (beside MISSION FOLDER) lists every file on the SSD tied to that Mission: each case number's Files tab and the Mission Folder, newest first. Click a name to open it.
- **Notifications** have a **Time** box.
- **No Vehicle:** tick it on an offender to hide Vehicle, VIN and Plates; they are left off the PDF too.
- **Pre-Recorded Funds:** an Electronic Funds line no longer runs into its reference numbers.
- **Timeline:** **Clear** empties the whole form, and also stops an edit in progress.

## What's new in v1.81

- **Supplementary Report PDF layout:** each offender has a sheet of their own: In Custody or Not in Custody, then Name and A.K.A., gender | race | age, height and weight, DOB, eyes and hair, complexion and tattoos/scars, what they were wearing, residence, phone, IR and CB numbers, vehicle, VIN and plates. **Police Personnel** is a table (Name, Star, Unit, Role), each **Charge** is its statute over its description, and each **Exhibit** shows its inventory number, type and description (additional exhibits as Exhibit 13a, 13b… with their photo labels).
- **Status and How Cleared** on the PDF use square boxes with an X, like Update Information.
- **Offenders** on the Draft have **Custody** (In Custody / Not in Custody), **Residence**, **CB Number**, **Vehicle**, **VIN** and **Plates**.
- **Subject Data** fills itself from the reports: the Name box suggests the suspects (Details) and offenders (Draft) of the Mission's cases; pick one to fill the empty boxes. **Add From Reports** adds everyone not on the sheet yet.
- **Mission Folder** has an **Other** folder next to Vehicle List.

## What's new in v1.80

- **Subject Data sheet:** open a Mission, then **Subject Data** in its Mission Folder. Each subject gets a demographics sheet (name, alias, date of birth, gender, race, height, weight, hair, eyes, phone, IR/FBI/IDOC numbers, address, tattoos/scars, notes) with **Add Photo** on the right. **Add Subject** adds as many as you need; the sheet saves as you type, in the folder on the SSD.
- **Rename or Move:** in the Files tab the row's pencil button opens **Rename or Move**; type a new name, pick another folder, or both, then **Save**. A case number with hyphens (2026-EX-100) is no longer put in the new name twice.
- **Dates:** days always have two digits ("October 04, 2026"), everywhere, and dates line up on the right in tables (Updated, Opened, Start and End Date).
- **Pre-Recorded Funds:** **Electronic Funds** is now a denomination; its numbers are transaction / reference numbers instead of serial numbers.

## What's new in v1.79

- **Files tab:** the **Document** column now shows each file's icon (hover it for the document type and file type). **Arrange** works in every view, **All documents** included, and so does dragging rows when the order is **Custom**. A file you rename keeps its place.
- **Renaming:** a name like **Exhibit 3b** now shows as typed. Only names in the form "Type - Description" (e.g. "Supplementary Report - Purchase") leave the type out, since the Document column shows it.
- **Timeline:** the date square is wider so the time never clips, and the date, the dot on the line and the event box are evenly spaced.
- **Drop-down lists** fit inside the window when you make it narrower; long choices wrap.
- **Officer's Report:** Gang Affiliations, Persons Present Not Arrested, Police Personnel on Scene, Vehicles and Notifications each sit in one grey box.

## What's new in v1.78

- **Operations are now Missions.** Every label, button and message says Mission: New Mission, Mission Number, Mission Name, Mission Folder, Mission Plans, Delete Mission. Your existing Operations simply show as Missions; nothing on the SSD is renamed.
- **MISSION FILES in the sidebar.** Every Mission sits inside one **MISSION FILES** folder, like **GENERAL FILES**. Click **+** on it to make a new Mission. Click the folder's name to see all Missions; the arrow folds it. **New Mission** is also beside **All Missions** on the home page.
- **A Mission's Timeline on its page.** Open a Mission: its **TIMELINE** (every case number in it) is right under Files. Add, edit and tick off entries there.
- **Timeline dots** now sit exactly on the centre of the line.

## What's new in v1.77

- **Sidebar folder names in capitals:** **MISSION FILES** (the closed cases of Operations that are still going on; it was "Operation Files"), **GENERAL FILES**, **CLOSED FILES** (it was "Closed") and **ARCHIVED**.

## What's new in v1.76

- **DNA** (Does Not Apply) is offered for the **Federal Jacket Number** (new case and Details) and for the **IR, FBI and IDOC Numbers** of suspects, offenders and the Officer's Report: click the arrow in the box.
- **Timeline:** every marker is a circle now, deadlines included.
- **Draft:** Victim/Offender/Property/Circumstances **Verified** and **Updated** sit together in one grey box. Hover a part's checkbox to see whether it is in the report, left out, or hidden on screen. **Not in the report** has its own column, next to the green check.
- **Files tab:** a file's name leaves out the document type, which the Document column already shows, so it reads `2026-EX-100 | Purchase`. **Updated** has the time under the date. The table text is the same size as the rest of CaseVault.
- **Arrange files:** open a folder and click **Arrange** above the table to put its files in your own order (arrows or drag). The folder list's button is now just **Arrange**, boxed like **Discovery**.
- **Adding files:** the File name box has no cut-off hint any more, and the boxes stay put while you type.

## What's new in v1.75

- **Shield folder icons everywhere.** The new folder icons now appear wherever a folder does: the sidebar, the case page header, the Files tab, Operation folders, and the Move and New Folder buttons. Blue means an Operation (MISSION FILES), purple means General Files and ordinary folders, green means Other Files. Closed uses a muted green shield and Archived a grey one.

## What's new in v1.74

- **Needs Attention** can fold into one slim bar: click the arrow on its right. The bar still says how many items there are and how many are overdue (in red). Click the bar or the arrow to open it again. CaseVault remembers which way you left it.
- **MISSION FILES:**
  - The Operations section is now **MISSION FILES**. **MISSION FILES**, **GENERAL FILES** and **OTHER FILES** have headings of the same width.
  - Their folders have new icons: blue for Mission Files (and the Operation Folder), purple for General Files, green for Other Files. Each section's edge and its header button (All Operations, All Cases, New Folder) are in the same colour.
  - **New Folder** for Other Files is now in the section's header, top right.
- **Quick Links:** **REFERENCE** is in capitals, like OSINT and LEO.
- **Operation page:** **FILES** and **OPERATION FOLDER** have plain headers without the icon. The short explanation of each is now a small line under its section.
- **Clickable things show it:** when the mouse is over a link, it underlines; buttons, folders, tiles and list rows take the accent colour.
- **Link Chart:** a line carrying narcotics shows the cannabis icon, and one carrying money shows the money icon (also in the PDF).

## What's new in v1.73

- **Easier to see:** the case list and the Quick Links bar have a cool slate shade, and their buttons (Operations, cases, links, tabs) are white with a soft shadow that lifts when you point at them. Works in dark mode too.
- **Timeline, redesigned:**
  - A summary strip on top: **Events**, **Open Deadlines**, **Overdue** and **Next Due** (with its name).
  - Filters: **All**, **Upcoming**, **Deadlines**, **Past**.
  - The entries hang on a rail under month headings, each with a date chip (day, weekday, time). The marker on the rail is blue for an event, an amber diamond for a deadline, red when overdue and green when done.
  - A red **Today** line shows where the past ends. Edit and Delete appear when you point at an entry.
- **Operation Folder** shows its folders as folder icons, each with what it's for. Click one to open it; its files and Add Files show only then. Click it again, or **Close**, to close it.
- **Vehicle List** (was Running Vehicle List; files already in it are moved over):
  - **Add Vehicle** makes a card with the Draft's vehicle fields (Year, Make, Model, Color, License Plate, Plate State, VIN, Impound / Tow), plus **Registered Owner**, **Registered Owner Address** and Notes.
  - On the right of each card is **Add Photo** for a picture of the vehicle; click the photo to view it, or Replace / Remove it.
- **Draft → Vehicles** also has **Registered Owner** and **Registered Owner Address** (Owner and Notes is now Notes).

## What's new in v1.72

- **OTHER FILES** shows its folders as folder icons, like Operations and General Files: **USPIS Files**, **DEA Files**, **INET Files**, **Training** and **Other**, each with what it's for under its name and its file count on the icon. Click a folder to open it: its files show below, with Add Files (or drop files on it). Click the folder again, or **Close**, to close it. **New Folder** makes your own; one you made can be removed with **Remove Folder** once it's empty.

## What's new in v1.71

- **Back to Top** is always there, bottom right beside Ask AI: an up caret (**^**). Click it from anywhere in a long form.
- **Pages line up:** every page (Overview, Operations, General Files, a case, Reference) starts at the left, next to the case list, at the same width. Going from a folder to a case no longer shifts everything to the middle.
- **OTHER FILES folders:**
  - **USPIS Files** (US Postal Inspection Service), **DEA Files** (Drug Enforcement Administration), **INET Files** (Internet Narcotics Enforcement Team), **Training** and **Other**. Each tab shows what the folder is for.
  - Files added to Other Files before v1.71 are under **Other**.
  - **New Folder** makes your own folder. A folder you made can be removed with **Remove Folder** once it is empty.
- **Overview:** Operations, General Files, Other Files and Recently Updated are matching panels. Each header has the title, a one-line description and its button in the same place.
- **Recently Updated** is an even table (Subject, Case Number, File Number, Status, Updated) in the Quick Links' smaller, regular type.
- **Draft:** a finished part no longer has a green bar against its checkbox. The green check on the right still shows it's complete.

## What's new in v1.70

- **Overview:** the **OPERATIONS**, **GENERAL FILES** and **OTHER FILES** headings no longer have folder icons.
- **Files tab:** an Additional Exhibit's photos are listed as *Exhibit 1a*, *1b*… (the files keep their names on the SSD). The eye button is gone: click a file's name to open it.
- **Back to Top:** once you scroll down a page, an up arrow appears at the bottom right, beside Ask AI. Click it to go back to the top.

## What's new in v1.69

- **Quick Links** stay at the bottom of every page, not only the Overview. Changes in Vault → Quick links show at once.
- **Operation Folder:** the folders (Subpoenas, Affidavits, Operation Plans, Maps, Subject Data, Running Vehicle List) are tabs like a case's Details, Timeline, Draft… tabs, each with its count.
- **Sidebar:** case numbers and the archive sub-folders (EXPIRED, NOLLE PROSEQUI, PROSECUTION) are the same size as the folder names.
- **One look for every field**, the Draft's: a grey box, the heading small and grey at its top, and what you type at the same size. This is on every page and popup (Details, New Case, New Operation, Timeline, Mail, Vault…), and the Operation page's details match.
- **Dates:** type the first letters of a month and it's predicted (*sep* → *September*); press **Tab** to take it, type the day, and **Tab** again to fill in this year (*September 30, 2026*). Typing numbers (12.01.2026) works as before.
- **Suspects and Offenders have the same fields**, the Offender also has Clothing Description:
  - **Hair Style** is new on both, with a list to pick from or type over.
  - Suspects gain Gender Identity, Veteran, Relation Code and Moniker / Social Media. Offenders gain IR, FBI and IDOC Numbers.
  - **Add From Suspects** copies all of them; the moniker joins the offender's Monikers / Social Media.
- **Draft:**
  - *Hidden on screen* now sits beside the part's checkbox, in its own column, so the titles line up.
  - **Arrest Unit** and **If Residence, Where** offer **DNA** (Does Not Apply).
  - **Court Branch and Court Officer** offers **Pending**, and **Court Date** has a **Pending** box.
  - **Adderall** is in the Narcotic Type list.
  - The **Search Warrant Number / Subpoena GJ Number** label switch (and ASA / AUSA, Judge / Magistrate) is always wide enough for its words.
- **Checks (AI):** a photo is read only for the words written in it. OCR lines it isn't sure of, or that aren't real words, are dropped, and a photo with no writing is skipped. The AI sees the photo as *Photo 2*, never by its file name, so camera names like *IMG_20250312_1430* can't be read as a date and time. No hidden camera data is ever read.
- The **Power Off** hover text is shorter.

## What's new in v1.68

- **Additional Exhibits** (Draft → Evidence Inventoried): photographs or screenshots that aren't tied to an inventory number.
  - Click **Add Additional Exhibit**, pick **Photographs** or **Text Messages**, give it a title and a description, and add the pictures. Each picture can be labelled like the exhibit photos.
  - They're numbered on their own: **Additional Exhibit 1, 2…**, the pictures **1a, 1b…**. **Next Additional No.** starts the numbers anywhere; **Reset to 1** and **Automatic** work like the exhibit numbers.
  - The pictures are saved in the case's **Other Exhibits** folder. They're listed in the report's Evidence Inventoried and printed on its Exhibit Attachments pages.
- **Text Message PDF:** on a Text Messages exhibit, **Text Message PDF** makes a portrait PDF of the screenshots, two side by side on each page, each with its label (*Additional Exhibit 1a - Text Messages: …*). It's saved under **Files → Other Exhibits** and opens to view or print.
- **Power Off** (the red button next to the SSD icon at the top): saves everything, then closes CaseVault and its browser window, stops the CaseVault helper and the AI engine, and locks and ejects the **V:** and **W:** drives. Wait for Windows to say it's safe, then unplug the SSD. It needs the new helper (1.10.0, see *SSD update* below); without the helper it just saves and closes.
- **Overview:** the headings are **OPERATIONS**, **GENERAL FILES** and the new **OTHER FILES**: a place for files that don't belong to any case (forms, training, reference sheets). Add, open and delete them there.
- **Operation Folder:** every Operation has its own folder, not tied to a case number, with **Subpoenas**, **Affidavits**, **Operation Plans**, **Maps**, **Subject Data** and **Running Vehicle List**. Open it from the Operation's page or the first card under the Operation on the Overview. These files are kept on the SSD in `CaseVault-Data\shared`.
- **Draft green checks:** a part or a line you've unticked counts as done; an empty phone number box you didn't add a number to doesn't count against it; photo labels and Additional Exhibits are optional. The checks sit in one column next to the fold arrows.
- **How Cleared:** new choice **6 - On Going**.
- **Files:** the **Added** column is now **Updated**: the last time the file changed.
- **Street value chart:** each drug category has its own colour icon. Every page and popup was checked for the theme (colour icons, Consolas, square corners).

## What's new in v1.67

- **Statute of limitations (narcotic charges):** a narcotic charge has to be brought within **3 years of the Date of Occurrence**.
  - CaseVault reads the **Date of Occurrence** on the Draft tab. Without one, it uses the earliest **arrest date** in Arrest details.
  - It counts a charge as narcotic when it's under the Illinois Controlled Substances, Cannabis or Methamphetamine Acts (720 ILCS 570, 550, 646), or federal Title 21 (21 U.S.C.), or when its description names a drug.
  - **5 days before** the 3 years run out, **Needs Attention** shows *CASE NUMBER — Warning: Statute of Limitations Expiring* with a live count-down (days, hours, minutes and seconds). The last day counts.
  - The case gets the red border in the case list, and a reminder pops up once when you open the Overview.
  - Once the time has passed, the row says *Statute of Limitations Expired* until the case is closed or archived.
  - It doesn't apply to Closed or Archived cases.
- **Archived sub-folders: EXPIRED, NOLLE PROSEQUI and PROSECUTION.**
  - **Archive Case** asks which folder (or none). **EXPIRED** is picked already when the statute of limitations has passed.
  - In the case list, **Archived** shows each folder with its count; click a folder to open it.
  - An archived case can be moved between folders with **Archive Folder** at the top of the case.
- **Suspects → Not Identified:** tick it beside **Name** when the suspect isn't identified yet. The name box is set aside, and templates and the Draft's Add From Suspects say "Not Identified".
- **Draft:** a green check appears in a part's header once every field in it is filled in. You can see it with the part minimized.
- **Search Warrant Number** (and Subpoena GJ Number) now has twice the room of ASA and Judge, so long warrant numbers aren't cut off. Below 1400 pixels wide, the three lines stack.
- **Quick Links footer** stays the same height on every tab: the Outside Sites sign keeps its place, hidden on Reference.
- **Overview banner:** more space between the greeting and the Open / Pending / Closed / Archived boxes.
- Fixed: an archived case showed the word "null" under Deconfliction.

## What's new in v1.66

- **Quick Links footer:** on the left, the **Quick Links** name with the **Reference**, **OSINT** and **LEO** buttons stacked under it, then the Outside Sites sign and **Arrange**. The links fill the rest of the footer.
- **Charges** in the footer is one button again. Click it and it turns into **Federal** and **State**; click one to open those statutes. Click anywhere else or press Esc to put it back.
- **One place for reminders:** the "deadlines due" line is gone from the blue banner, and so is the count beside **Needs Attention**. The Needs Attention list shows them all.
- The due labels in Needs Attention are in Title Case: **Due Today**, **Due Tomorrow**, **In 3 Days**, **2 Days Overdue**.

## What's new in v1.65

- **Quick Links footer, taller:** four rows of links instead of two, so all the OSINT links show without scrolling (five columns). The footer keeps the same height when you switch between Reference, OSINT and LEO, so the page doesn't jump. If a tab ever holds more than 20 links, scroll inside the footer.

## What's new in v1.64

- **Case tabs look like the Options tabs:** square boxes side by side, each with its own icon (Details, Arrest, Timeline, Draft, Reports, Files, Link Chart, Mail, Checks). The open tab is white with a blue line along its top. **Arrest details** is now just **Arrest**. All nine fit on one row at 1280 pixels wide and up; on a narrow window they wrap.

## What's new in v1.63

- **Quick Links footer.** On the Overview, Quick Links sit in a footer bar under the page, running from the case list to the right edge of the screen. The bar has a blue top line.
  - The top row holds **Quick Links**, the Reference / OSINT / LEO tabs and **Arrange**. On the OSINT and LEO tabs, a small **Outside Sites** sign carries the warning about outside websites (point at it to read it).
  - The links are in **five equal columns**. Two rows show at a time; if a tab has more links, scroll inside the footer.
  - **Charges** has its **Federal** and **State** buttons inside it.
  - **Arrange** opens the footer up. Each link gets ‹ (move left), the eye (show or hide) and › (move right) underneath it, and you can still drag links.
  - The round Ask AI and Notes buttons sit just above the footer.
  - The footer shows only on the Overview. On a narrow window the links use three columns, and on a phone two.

## What's new in v1.62

- **Quick Links stay at the bottom** of the Overview screen while you scroll. The tabs and links are on one compact bar, and the round Ask AI and Notes buttons sit just above it. If you have more links than fit in two rows, the bar scrolls. On a phone-sized window the links stay at the end of the page.
- **Street value chart:** the form in brackets has its own **Form** column (Cocaine | Powder, Heroin | Black Tar…). Every category has the same columns at the same widths, so prices line up down the whole chart. The calculator sits above the chart.
- The note under the calculator now reads "HIDTA 2022 street values. ≈ Estimates (gram price × 454)."
- **Popups redesigned** (New Case, New Operation, the case picker, confirm boxes and others): a tinted title bar with an icon and a blue line, sections with a small heading (Case, File Details…), blue hint boxes, and the buttons on a bar at the bottom that stays in view while you scroll. New Case puts Client, Status and Opened on one row. The New Operation window was cut off on the right; it now fits.
- **Link Chart: one line per direction.** Each line has one arrow. For narcotics one way and money back, use two lines: they run side by side and never cross, even when the cards aren't level. Badges and labels sit on the longest part of the line, clear of the cards.
  - **Link Cards:** click A then B, then B then A. The line back gets the other badge on its own (Narcotics → Money).
  - Each connection card has **Turn Around** and **Add Return Line**.
  - Charts saved with an old **Both Ways** arrow open as two lines, and an old **Arrow From** is turned round.

## What's new in v1.61

- **A smaller banner** on the Overview. The Open, Pending, Closed and Archived counts are now in the banner, so the separate row of boxes is gone.
- **Quick actions:** one row of same-size buttons under the banner: **New Case**, **Draft**, **Discovery**, **Link Chart**, **Ask AI**, **Reference**, **Library** and **Vault**. Draft, Discovery and Link Chart ask which case first. Type part of a case number, subject or Operation number to find it, then click it or press Enter. Discovery opens the case's Files with the Discovery window on top.
- **Needs Attention:** deadlines that are overdue or due within the next 7 days, soonest first. Each row shows the case, what is due, the date and how long is left. Overdue ones have a red edge and a pink background, today's and tomorrow's a red edge, the rest an amber edge. Click a row to open that case's Timeline. When nothing is due, it says so in one line.

## What's new in v1.60

- **Operation names on two lines:** the Operation Number on top, the name below, in the case list and in the Overview's Operations folders.
- **Reminder border:** a case with a deadline coming up gets a thin red border in the case list, and so does its Operation, so you can find it while the Operation is folded. The bell is still there too.
- **Incognito icon:** the privacy screen button at the top of the case list is now an incognito icon. All the icons there are the same size.
- **A full case list** scrolls inside its own box with a thin scrollbar. The icons at the top don't move, and Closed and Archived stay at the bottom. Fold Operations you're not working on to keep it short.
- **Sharper text:** the header no longer blurs what's behind it, and the big Ask AI window sits on whole pixels. If text still looks soft, set Options → Zoom and Brightness to 100%, the browser zoom to 100% (`Ctrl + 0`), and check Windows display scaling (Settings → System → Display).

## What's new in v1.59

- **Link Chart:**
  - **Right-angle lines.** Connections turn at right angles and leave a card from its side, top or bottom, so they don't run across the photos. Each connection has **Line: Right Angles / Straight**.
  - **Two lines between the same two cards** sit side by side, one above the other, with their labels above and below. For example, *narcotics* from the subject to the police, and *money* tendered from the police back to the subject.
  - **Link Cards:** click A then B for an arrow from A to B. Click B then A to add the line back (it's drawn beside the first). Click A then B again to take the A→B line away.
  - **Connections** are folded cards: one line each (who → who, Money or Narcotics). The **eye** shows or hides that line on the chart and in the PDF. The arrow opens it to change it.
  - **Save PDF to Case** now saves the chart in **Files → Link Charts** and under **Reports** (type *Link Chart*, with the chart in words). To change it, use **Send Back to Link Chart** in Reports (or **Open in Link Chart** in Files), make the changes, then **Save PDF to Case** again. Files and Reports are both updated.
- **Every form starts minimized:** the Case Overview sections, every part of the Draft tab, Arrest details and the Vault's sections start folded. Open one with its arrow; CaseVault remembers the ones you open, on this PC. **Show All** on the Draft tab opens them all. Clicking a Vault section on the left opens it.
- **Discovery → How to Burn a CD or DVD (Windows):** with **The SSD, for a DVD**, the box has the steps (also in the box shown when the package is made):
  1. Put a blank CD-R or DVD-R in the drive.
  2. In File Explorer, go to CaseVault-Data → exports.
  3. Right-click the package folder → (Show more options) → Send to → the DVD RW drive.
  4. Type a title, choose **With a CD/DVD player**, then Next.
  5. Click **Finish burning** (Drive Tools tab).
  6. Choose a speed, then Next, wait, and Finish.
  7. Check the disc by opening "Open Discovery.html" on it.
- **Checks tab:** a new look, with an icon header, the document to check and the AI choice on the left, the documents to compare against on the right, and past checks in their own box.
- **Ask AI:** the four suggestions are boxes of the same size, without the blue line.
- **Vault → Outbound Log:** shows how many months are on the SSD and their size. **Delete Older Months** keeps only this month; **Delete All** empties the log.
  - Does deleting free space? Yes, but very little: each month is usually a few KB.
  - The log is your record of what left this PC (online AI requests and mail hand-offs), so check your agency's rules before deleting it.

## What's new in v1.58

- **Link Chart zoom and moving around:** the mouse wheel zooms in and out around the pointer; drag the empty background to move around a big chart. The − / + buttons and Fit still work.
- **Grid:** the chart sits on small, faint olive-green squares (on screen only; the PDF is white). In **Free** layout the **Snap** button makes dragged cards land on the squares so they line up; turn it off to place cards exactly.
- **Platforms:** **Facebook** and **Instagram** are now separate (cards saved as "Facebook / Instagram" become Facebook; change the ones that are Instagram). New: **Grindr**, **Cash App**, **Venmo**, **Zelle**, **Apple Pay**, **Coinbase** and **MoonPay**, each with its own picture. **Dark Web** is still there.
- **Money and narcotics on a connection:** each connection has **Carries**: Nothing, **Money** or **Narcotics**. Money draws a green line with a small round **$** badge; narcotics an orange line with a small round **capsule** badge. The arrow says who sends and who receives. With **Link Cards** on, pick what new links carry in the **Carries** list next to it.

## What's new in v1.57

- **Icons and buttons.** Every icon is now in the colour style: the Ask AI window's buttons, Options, the Overview banner (its buttons are white now), Suspects, Case Actions, the arrows, plus and minus, close, warnings and info, file types, and the theme switch. Only small arrows that open lists and the text-formatting buttons stay plain.
  - The blue buttons (Save, Close Case, Create…) and the red ones (Delete Case, Purge…) are a light tint with a coloured border and coloured words, so their colour icons sit on them without a white square.
- **Field boxes** (Draft, Arrest details, Mail, Timeline, Contacts, Vault…) have a thin border and a faint line under them, so boxes next to each other don't run together.
- **Header.** The drive name ("V: | CaseVault-Data") no longer shows under the CaseVault logo; point at the SSD square at the top to see where the data is saved.
- **Options** has a new look: an icon header, tabs, and each setting in its own card.
- **Ask AI window**: a header bar with square buttons, the model and case in a grey box, and framed prompt suggestions and message box.
- **No double close buttons.** A box that has Done, Close, Cancel or OK no longer also has an X. Esc still closes every box.
- **Quick links:**
  - LEO: **Illinois Compiled Statutes**, **Chicago Cop**, **NW3C**.
  - OSINT: **ZetX**, **Bandwidth**, **TextNow**, **Blockchain Explorer**, **TRM Labs**.
  - **Geotime LIVE** now opens https://live.geotime.com/#/login. If you saved your own address for it earlier, yours is kept.
  - Accurint and Chicago HIDTA have new icons.
- **Discovery → Where To → A CD or DVD drive.** Put a blank CD or DVD in. If Windows asks how to use the disc, choose **Like a USB flash drive**. Then pick the disc drive in the window that opens, and CaseVault writes the package to it like a USB drive. Before you take it out, choose **Eject** (or **Close session**) in File Explorer so other computers can read it.
  - CaseVault does not format or burn discs; Windows does. For a disc made the other way (a mastered disc that plays in any player or older computer), use **The SSD, for a DVD** and burn the package folder with File Explorer (Share → Burn to disc), as before.
- **Updater 1.2.1:** the logo on the right of the Updater's banner is gone.

## What's new in v1.56

- **Link Chart overhaul** (see *Link Chart* under *Files* for the details):
  - **Subject** is now **Primary** (Add Primary).
  - **Tree** or **Free** layout. In Free, drag cards anywhere. In Tree, **Move Left / Move Right** set the order and **Per Row** sets how many cards sit side by side.
  - **Link Cards**: click a card, then another, to draw an arrow; click two linked cards to unlink them. Each connection is one line with one arrow (or none); for both ways, draw a second line back (it sits beside the first).
  - **Zoom** in and out, and **Fit**, for big organization charts. A line under the chart says how big the names will print, and when the chart is too crowded to read (up to 4 in a row print full size, up to 6 stay readable).
  - **Clear Chart** button. The Chart Title has no sample text.
  - No more cut-off words: names, aliases, web addresses and labels wrap. The form boxes and connection labels show the whole text.
  - Phone cards use the same phone format as the rest of CaseVault.
  - **Open in Link Chart** in Files → Link Charts sends a saved chart back to the tab. The PDF is named after the chart title, so you can keep more than one.

## What's new in v1.55

- **Discovery receipt.** In **Files → Discovery**, the **Options** box has **Make a receipt to sign (PDF to Downloads)**, on by default. When the package is made, CaseVault also makes the **Discovery Receipt** PDF:
  - It shows the case, date produced, Bates range, package, number of files and size, storage medium, **Turned Over By** (your name and title from My Profile) and **Turned Over To**.
  - **Date of Receipt** and **Time of Receipt** are blank boxes, filled in by hand at the hand-off.
  - Every item is listed with its Bates numbers, pages and SHA-256 fingerprint.
  - An **Acknowledgment of Receipt** says the recipient received the items and that they are accurate and complete as listed.
  - Signature lines (sign in ink) for the **Recipient**, the **Officer** and a **Witness**, each with printed name and date/time.
  - The PDF is saved to **this computer's Downloads folder** (the browser's download), ready to print. That copy is on the PC, not the SSD: once it is printed and signed, delete it from Downloads. A copy is also kept with the case (Files → Discovery → Earlier productions → **Receipt**). The Done box has **Download Receipt** and **Print Receipt**. Productions made before v1.55 get a receipt the first time you click Receipt.
  - The agency name comes from My Profile; there is no seal or form number.
- **Discovery popups** have a new look: an icon header, the options grouped in three boxes (Recipient And Bates, Where And Password, Options), and summary tiles (files, size, Bates, produced to) in **Ready to Copy** and **Discovery Package Ready**.
- **Closed folder and Operations.** A closed case whose Operation is still going used to show under the Operation's name in Closed, which looked like the Operation was closed. Now these cases are listed by case number under one folder, **Operation Files**, in Closed ("N closed cases of ongoing Operations"). When the Operation itself is closed, it moves to Closed with its name as before.

## What's new in v1.54

- **Draft tab, Officer's Report:**
  - **Court Branch and Court Officer** and **Court Date** share one line.
  - Three boxes share the next line, and each label is a switch: **Search Warrant Number / Subpoena GJ Number**, **ASA Approving / AUSA Approving**, and **Judge Approving / Magistrate Approving**. Click the label to pick. The text stays when you switch, only the one you picked goes in the report and the PDF, and the PDF's label follows (e.g. *AUSA Approving Subpoena*).
  - **Pre-Recorded Funds:** **Add Funds** opens a small box. Pick the denomination and enter the serial numbers, one per line; the quantity counts them, or type it when not every bill was recorded. Each denomination shows as one line (e.g. *$20 × 3 AA01, AA02, AA03*) with Change and Delete. One **Recovered / Not Recovered** list at the lower right covers them all. Bills entered one by one before v1.54 are grouped by denomination by themselves.
  - The label under an evidence photo is one line.
  - **Extra Copies Required** is gone, from the form and from the PDF's signature table. That table now has the reporting officer's name with a tall signature box under it.
- **Reports → New Report:** the Type is **Case Summary**, **Affidavits** or **Other**, and the Title box is empty. Reports made before keep their type.
- **Arrest Report PDF:** *2nd Arresting Officer* is written like the 1st, so it no longer runs into the star box, and there is room before *Approving Supervisor*.
- **Mail tab** and **Vault:** fields are in grey boxes like the Draft tab. Each Vault section is a card that folds away with ▾ / ▸, and so do **LEO Partners**, **Suspects**, **Contacts** and **Deconfliction** on the Details tab. What you fold stays folded on this PC.
- **LEO Partners** shows only the agencies working this case. **Show All Agencies** brings back the others to pick from; **Show Only Working This Case** hides them again.
- **Quick Links:**
  - **OSINT** has **Geotime LIVE**. Its address isn't known to CaseVault: add your agency's in Vault → Quick links.
  - **LEO** has **Chicago HIDTA** going to its submission form (https://www.chicago-hidta.org/submission-form-2). It is fixed: always shown, and its address can't be changed.

## What's new in v1.53

- **Square drop-down lists everywhere.** Clicking a drop-down (or Alt+↓, F4, Space or Enter) now opens CaseVault's own square list instead of the browser's rounded one. ↑ ↓ choose, a letter jumps to it, Enter picks, Esc closes.
- **More colour icons:** search, hide, offline, the AI robot, PDF View, Word View, Draft with AI, Review, Export, Save, the Files folders and others are drawn in the same style as the rest. On a blue button the icon sits on a small white square.
- **Colours:** the page is a softer off-white, and icons sit on white tiles. The header buttons show their state with a coloured line under them: green is fine, red is off or a problem. The deadline bell is red.

## What's new in v1.52

- **Link Chart** tab on every case (after Files): who is under whom, with photos, monikers and webpages, ready to print in portrait. See *Link Chart* under *Files*.

## What's new in v1.51

- **New icons:** CaseVault has a new set of colour icons. Folders are coloured: Operations blue, General Files yellow, Closed green with a check, Archived dark. Trash, calendar, phone, map, notebook, chat, settings and more are in colour too. On blue (filled) buttons and on the Overview banner, the icons stay white. The banner itself is unchanged.
- **LEO Partners:** each agency has its own colour badge (CaseVault's drawings, not official seals). They never go on a report or PDF.
- **New logo:** the safe with the document is on the browser tab, at the top left and on the installed app.
- **Field Notes and Ask AI** (bottom right) are white squares with the colour notebook and chat bubble.
- **Updater:** the window opens with a blue fading banner like the Overview's: the title, the version on the SSD, and a shield with a padlock. The CaseVault logo is gone from it; it is still on the window's title bar.

## What's new in v1.50

- **Privacy screen:** the blue 1s and 0s now fall on a muted near-black. With a PIN, a thin box in the lower right says **AUTHENTICATE**, and each digit shows as an asterisk.
- **Supplementary Report PDF:** each box's label is on a grey band, and what you filled in is on white under it. This covers the signature table too (Extra Copies, Date Submitted, Reporting Officer…), as well as Update Information, Status and How Cleared. The Officer's Report part is unchanged.
- **Arrest details, Timeline, Contacts and Deconfliction** look like the Draft tab: each field is a grey box with its label small inside it, and the section headers are in capitals.
- **Dates:** the calendar button opens CaseVault's own square calendar. **«** and **»** change the year, **‹** and **›** the month; it also has **Today** and **Clear**, and works with the arrow keys and Page Up / Page Down.
- **Case list:**
  - The folders start folded. The folder holding the case, Operation or General Files on screen is open. A folder you open with its arrow stays open until you go to another page.
  - **Search** is an icon; click it to show the search box (Esc clears and hides it).
  - **Home** and **Hide** (the privacy screen) are next to Search; the header keeps only the menu ⋮.
  - A closed case of an Operation that is still open stays in that Operation's folder and also shows under **Closed**.
  - **Closed** and **Archived** at the bottom are grey folders with a drop-down arrow.
- **Move File** replaces Assign to… and Unlink. It moves a case into an Operation, from one Operation to another, or back to General Files. See *Operations and General Files*.
- **Discovery:** the list on the left can show files from this case, its whole Operation, another Operation, all cases or one other case, and the search box also finds case numbers and subjects. **Create Discovery Package** first opens **Ready to Copy**, a list of every file with its case and size and the total. **Copy Now** starts; **Back** changes nothing.

## What's new in v1.49

- **Discovery** on the Files tab: choose files on the left and they go to the list on the right. CaseVault then writes a password-protected package to a USB drive or folder, or onto the SSD for a DVD. The recipient opens it in Chrome or Edge with the password and can view and print, not download. Every page carries its Bates number. Video and audio play in the window, and an index lists every item with its fingerprint. A portable VLC can go along, and each production is logged in the case. See *Discovery* under *Files*.

## What's new in v1.48

- **Supplementary Report PDF:** the box at the top right is the **R.D. Number**. Event, Incident and Raid Number share the row under it. A form saved before keeps the number from that box as its R.D. Number. On the Draft tab the R.D. Number starts as the case's Case Number.
- **Draft tab:**
  - Every field is its own grey box with its label inside it. An empty box shows its label as the placeholder; once there is a value, the label sits small at the top of the box. A label too long to fit as a placeholder stays at the top, in full.
  - The section headers are in capitals.
  - An offender's phone numbers start folded away: **Show Phone Numbers** (with how many there are) opens them.
  - **Status** and **How Cleared** are spelled out (0 - In Progress, 3 - Cleared Closed, 3 - Referred for Prosecution…). Forms saved before read the same. The PDF keeps the short codes in its row of circles, as on the printed form.
- **Square drop-down lists** everywhere in Chrome and Edge: the list that opens under a box such as Status no longer has rounded corners.
- **Every report you send is its own:** sending the Draft tab again always asks **New Report** (the default) or **Update**. New Report leaves the report sent before exactly as it was, with its own sections, evidence and PDF. For example, a Purchase report without Evidence Inventoried and then a Surveillance report with it, or two Purchase reports (the UCO's and the surveillance officer's).
- **Templates:**
  - Only your DEA 6 sample stays. The first time v1.48 opens your vault, every other template is moved, not deleted, to `CaseVault-Data\templates\removed-v1.48`. Copy one back to `templates` to use it again.
  - There are no built-in starter templates.
  - The DEA 6 document type is now called **DEA Style**.

## What's new in v1.47

- **Overview:** a new **General Files** section sits between Operations and Recently Updated. It has a folder for each year (newest first) holding the cases that aren't in an Operation, filed by the year they were opened. Click a year to see its cases, each with Details, Reports and Files. **All Cases** opens the General Files page. The Operations section now holds only Operations.
- **General Files folders are amber** (Operations stay blue): on the Overview, in the case list, on the General Files page and on a case's header and Details bar.
- **Supplementary Report PDF:** the caption under each exhibit photo is no longer bold. Before, only its first line was.

## What's new in v1.46

- **Operations and General Files** (see *Operations and General Files* above): an Operation is now its own record (number, name, status, start and end dates, notes) and cases are linked to it. General Files lists every case. Link, unlink, add a new or an existing case, edit the Operation once for all its cases, and delete an Operation without losing a case or a file.
- **Case Number and Subject Name:** each case shows its Case Number with the subject under it, in the case list, the case's header, the Overview and General Files. Case Numbers must be unique; the same subject on another case asks first, and a similar name is pointed out.
- **First time you open your vault with v1.46:** vault.json is backed up, then cases that share a Title become an Operation. Nothing on the SSD moves; no file is copied.
- **Search** finds the subject and the Operation's number and name too.

## What's new in v1.45

- **Supplementary Report PDF**: same sections and order, laid out more neatly.
  - Every row of boxes sits on the same eight columns, so the lines run straight down the page.
  - Each label fits on one line.
  - Status and How Cleared take half the width each.
  - The Event, Incident, Raid and R.D. numbers are four equal boxes.
  - The officer's report labels are all one width, so the grey boxes start in the same place.
- **Arrest Report PDF**: every value is now in a light grey box.
  - Within each section the labels share one width, so the boxes line up.
  - Incident, Arrestee Vehicle, Court Info and Bond Info have two columns of the same width.
  - Charges, Recovered Narcotics and Warrants are grey rows on fixed columns.
  - The narrative and the properties sit on a grey background.
- **Draft tab and Arrest Details tab**: the entry boxes are more compact (tighter rows, shorter boxes).
  - On the Draft tab, Status and How Cleared fill a row together; Veteran shares a row with Tattoos / Scars; and a charge's Statute shares a row with its description.
  - On Arrest Details, every section uses four columns, and the arrestee's photo is the fourth column beside the offender's details. No box is left alone on a row.

## What's new in v1.44

- **PDFs:** times print as military time without the colon (**1435**), in both reports and in the report text. On the Supplementary Report every value sits in a light grey box (no dotted lines). Each offender, victim, officer or person present has their name in bold on its own line, with the details under it. The officer's report lines come in blocks with a little space between them: who; the court and the warrant; who else was there; the evidence and the money; the record numbers; vehicles and notifications. The layout is the same as v1.43.
- **Details tab:** **Title or Operation Name**, **Status**, **Opened** and **Closed** share one row, and **File Number**, **Original Case Number**, **Federal Jacket Number** and **Client** share the next. The Tags box is gone (tags saved before are kept and still found by the search box). The U.S. Marshals badge is now a star in a ring.
- **Overview:** an open operation's case numbers have three buttons: **Details**, **Reports** and **Files**.
- **Draft tab:**
  - **Method Code** and **Safe Method** have a list with **DNA** (does not apply); anything else can still be typed.
  - Number of Victims, Number of Offenders, Number Arrested and Method Code fit in one row.
  - For a person, Gender, Gender Identity, Race and Complexion fit in one row, and so do Height, Weight, Hair Color and Eye Color. The long race names are shortened on screen; the full name is what is saved.
  - In Assignment, Method Assigned, Unit Number, Safe Method, Arrest Unit and If Residence, Where share a row, and Adults, Juveniles, Fire and Gang Related share the next.
  - **Not Recovered** is no longer cut off in Pre-Recorded Funds.
- **Files:** the Size column is wide enough for "000 KB".

## What's new in v1.43

- **Supplementary Report PDF** (Draft tab → Print / PDF, Reports, Files) now looks like a narcotics division supplementary report form. It is set in Times, with the title and the **Agency Report Number** box at the top. Below that comes a ruled grid where each box has its small label: offense, IUCR, occurrence, victims, offenders and assignment. Then the **Update Information** tick boxes, **Status** and **How Cleared** with a round mark under the choice, and the Event, Incident, Raid and R.D. numbers. The officer's report follows as **LABEL:** lines, with each offender, officer, bill or vehicle on a line of its own, then the **Summary of Investigation** and a three-column signature table. Every other page starts with the four numbers and ends with **Preparer** and **Approval** initial boxes.
- **Arrest Report PDF** (Arrest Details → Print / PDF) now looks like a records-system arrest report. **ARREST REPORT** and the agency are at the top left, with the CB, IR, YD, RD and Event numbers stacked on the right and an **ARREST REPORTING** band under them. Each section is framed and named on a grey tab down the left: Offender (with the description in a column and the photo on the right), Incident, Charges, Recovered Narcotics, Warrant, Non-Offender(s), Arrestee Vehicle, Properties, Incident Narrative, Court Info beside Bond Info, and Reporting Personnel with the signature fields. Later pages repeat the CB number and the arrestee's name.
- Neither PDF has any agency's name, seal or form number built in: the agency comes from Vault → My Profile.

## What's new in v1.42

- **Overview:** the Upcoming Deadlines list is gone; the banner at the top already says what's due. Click an operation's folder and its case numbers show where that list was, each with buttons for every tab (**Details, Timeline, Draft, Reports, Files, Mail, Checks**), under the operation's timeline. The folders themselves stay where they are. The timeline's title and each event's title are centered.
- **Sidebar:** a cleaner look, with a new folder icon for each operation. An operation whose case numbers are all **Closed** moves to the **Closed** section at the bottom of the list, just above **Archived**.
- **Field Notes** are single spaced (no blank space between paragraphs), and the preview on the Reports tab no longer fades out at the bottom. Hovering over the Field Notes or a report no longer shows a hover box.
- **Reports list:** a report sent from the Draft tab shows by its type of activity (**Purchase**, **Surveillance**…); "Supplementary Report" is already in the Type column. The folder button on each row (and **Send to Files** in the report window) saves its PDF to Files, in place of the copy saved before.
- **Draft tab:**
  - **IUCR Code** holds just the code. The list shows each code with its description, and picking one puts the description in **Offense Classification**.
  - **Pre-Recorded Funds** is one compact row per bill: Denomination, Serial Number, Recovered. Quantity is gone.
  - **Notifications** no longer have a Notes box; notes written before become the Person Notified when that was empty.
  - **Exhibit numbering:** next to **Add Exhibit**, **Next Exhibit No.** shows the number the next exhibit gets. Type a number to start from there, click **Reset to 1** to start again (numbers this case already uses are skipped), or **Automatic** to number on as before (shared by cases with the same federal jacket number).
- **Files:** the Document column breaks only between words, so "Supplementary Report" is never cut.
- **Dev Tools:** the Document Anonymizer is laid out in numbered steps (Original, Fictitious, Keep It), and **Emergency Purge** sits apart in red with a skull and crossbones.

## What's new in v1.41

- **One draft, several reports:** each report sent from the Draft tab is named after its heading, such as **Supplementary Report - Purchase**, and so is its PDF in Files. If you change the **Officer Report Type** after sending (Purchase to Surveillance, say) and click **Send Draft to Reports**, CaseVault asks: **New Report** keeps the Purchase report as it was sent and adds a Surveillance report next to it; **Update** replaces the Purchase report (and its PDF). Sending again with the same type just updates that report. Two reports of the same type get "2", "3" on the end, so a PDF is never overwritten by another report's.
- **Exhibit photo names match the Draft tab:** a photo added to Exhibit 1 is saved as **Exhibit 1a**, the next as **Exhibit 1b**. Photos saved before as "Exhibit 1" and "Exhibit 1 (2)" are renamed to 1a and 1b the next time you open the Draft tab (only when that name is free).

## What's new in v1.40

- **Timeline:** **Clear** (next to Add to Timeline) empties the form: today's date, Event, no time, title or note. The date of each event now stays on one line next to its marker.
- **Reports are view only** (the Field Notes stay editable). Click a report, or its eye button, to see it as a PDF in the same window the Files tab uses. A report sent from the Draft tab has **Send Back to Draft** (in the list and in that window) to correct it; a report made with **New Report** has **Edit**.
- **Your own order:** drag a report by its grip (or focus the grip and press Alt+Up / Alt+Down). The order is kept on the SSD in the case's `reports-order.json`; new reports appear at the top.
- **Same PDF as the Draft tab:** every report sent from the Draft tab, not just the latest, prints from the form it was sent with, so it looks exactly like the Draft tab's Print / PDF.

## What's new in v1.39

- **Sidebar:** click an operation's name to open its Details; the arrow on the right folds it.
- **Suspects** (Details): IR Number, FBI Number, IDOC Number and Phone Number, with the description in even columns.
- **Offenders** (Draft): **Phone Numbers** (Add Another Phone) and **Monikers / Social Media** (a name and the app it's used on). Add From Suspects brings a suspect's phone along.
- **IUCR Code:** picking one (or typing a code in the list) fills **Offense Classification** with its description, for example *Delv: Synthetic Drugs*.
- **Officer Report Type:** the Draft tab's heading, the PDF and the report follow it: *Supplementary Report - Purchase*.
- **Purchase Price** (Officer's Report, above Pre-Recorded Fund Sheet): the wording (*$100.00 prerecorded 1505 funds in the form of:*), then **Add Bill** for each bill: quantity, denomination, serial number, and Recovered or Not Recovered. They print in the PDF and the report; both can be ticked off like every other line.
- **Draft buttons:** Show All and Hide All are at the top right; **Save Changes** is with Send Draft to Reports, Print / PDF and Clear All (the other two Save buttons are gone).
- **View-only reports:** a report sent from the Draft tab can't be edited under Reports. **Send Back to Draft** puts its form back on the Draft tab (asking first if another report is there); Send Draft to Reports then updates the same report and PDF. Reports sent before v1.39 didn't keep their form, so send them again from the Draft tab once.
- **Close Case:** asks who closed it (from My Profile), lists the operation's other open case numbers to tick, and, unless you untick **Update the Draft tab**, fills each one's Status and How Cleared (from the disposition, changeable) and ticks the Update Information boxes you choose.
- **Files:** a new exhibit photo is named *Exhibit 1* (no "photo"); the Added date stays on one line.
