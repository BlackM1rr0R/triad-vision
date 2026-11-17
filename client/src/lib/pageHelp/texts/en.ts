/** Page help texts in English: three very simple sentences per page (what · why · todo), public and portal pages. */
import type { FullHelpTexts } from '../registry';

export const HELP_EN: FullHelpTexts = {
  // start + hubs
  '/start': {
    what: 'This page asks you three short questions.',
    why: 'Your answers give you a personal plan for moving to Germany.',
    todo: 'Say who you are, pick your job and choose your German level.',
  },
  '/start/plan': {
    what: 'This is your personal plan, step by step.',
    why: 'You see what to do first and which tools help you.',
    todo: 'Start with step one. Open the tools, the guide and the jobs. Register to save your plan.',
  },
  '/tools': {
    what: 'This page lists all our free tools.',
    why: 'You find the right tool for your question quickly.',
    todo: 'Pick a group or search, then open a tool.',
  },
  '/for/:profession': {
    what: 'This page is about one job in Germany.',
    why: 'You see the tools, German words, practice exam and jobs for this work.',
    todo: 'Learn the words, try the practice exam and look at the open jobs.',
  },
  // am I eligible?
  '/path-finder': {
    what: 'This tool finds the best way to Germany for you.',
    why: 'You see the visa route, the expected pay and how long it takes.',
    todo: 'Answer five short questions. You can share the result by link.',
  },
  '/uygunluq-testi': {
    what: 'This is a short quiz about your chances.',
    why: 'It shows which path fits you: work visa, training, Opportunity Card or family.',
    todo: 'Answer seven questions and read your result.',
  },
  '/eligibility': {
    what: 'This is a quick visa check.',
    why: 'You find out which visa type fits you.',
    todo: 'Answer a few questions about you and your work.',
  },
  '/compare-visas': {
    what: 'This page compares the work visas in one table.',
    why: 'You see the differences at a glance.',
    todo: 'Read the table and find the visa that fits you.',
  },
  '/blue-card-check': {
    what: 'This tool checks a salary offer for the EU Blue Card.',
    why: 'The Blue Card needs a high enough salary.',
    todo: 'Type the salary and your job. You see the result at once.',
  },
  '/chancenkarte-calculator': {
    what: 'This tool counts your points for the Opportunity Card.',
    why: 'You need enough points to get this card.',
    todo: 'Answer the questions. You see your points and what is missing.',
  },
  '/anerkennung': {
    what: 'This page explains how to get your diploma recognised.',
    why: 'Many jobs in Germany need a recognised diploma.',
    todo: 'Pick your job and follow the steps.',
  },
  '/family-reunification-check': {
    what: 'This tool checks if your family can come to Germany.',
    why: 'Your spouse and children need certain things, like money and a flat.',
    todo: 'Answer the questions. You see what is ready and what is missing.',
  },
  '/germany-vs-other-countries': {
    what: 'This page compares Germany with other countries.',
    why: 'You see pay, visa, family and citizenship side by side.',
    todo: 'Pick the countries and read the comparison.',
  },
  '/visa-document-checklist': {
    what: 'This is a list of documents for your visa.',
    why: 'Missing papers can delay your visa.',
    todo: 'Choose your visa type and job, then print the list.',
  },
  '/visa-refusal': {
    what: 'This page helps after a visa refusal.',
    why: 'You learn the reasons and what you can still do.',
    todo: 'Pick your refusal reason and read your options.',
  },
  '/grade-converter': {
    what: 'This tool turns your grades into German grades.',
    why: 'German employers and schools use a 1.0 to 4.0 scale.',
    todo: 'Type your grade and the scale. You see the German grade.',
  },
  // money
  '/salary-calculator': {
    what: 'This page turns your gross salary into take-home pay.',
    why: 'You see how much money you really get each month.',
    todo: 'Type your salary and pick your tax class.',
  },
  '/cost-calculator': {
    what: 'This tool estimates what your move costs.',
    why: 'You can save the money you need in time.',
    todo: 'Choose what you need, like visa, translations and course.',
  },
  '/budget': {
    what: 'This tool plans your money for the first month.',
    why: 'The first salary comes late, and rent and deposit come first.',
    todo: 'Type your salary and costs. You see how much money to bring.',
  },
  '/payslip-explained': {
    what: 'This page explains a German payslip line by line.',
    why: 'You understand what is taken from your pay and why.',
    todo: 'Click a line on the payslip to read what it means.',
  },
  '/tax-refund-calculator': {
    what: 'This tool estimates your tax refund.',
    why: 'Many workers get money back from the tax office.',
    todo: 'Type your salary and costs, like your way to work.',
  },
  '/shift-pay-calculator': {
    what: 'This tool counts your pay for night, Sunday and holiday work.',
    why: 'Some extra pay for these hours is tax-free.',
    todo: 'Type your hourly pay and your shifts.',
  },
  '/tax-class-chooser': {
    what: 'This tool helps married couples choose a tax class.',
    why: 'The right tax class changes how much you get each month.',
    todo: 'Type both salaries and compare the results.',
  },
  '/rent-check': {
    what: 'This tool checks if a rent is fair.',
    why: 'You avoid paying too much for a flat.',
    todo: 'Choose the city and type the rent and size.',
  },
  '/send-money-home': {
    what: 'This tool shows how much money you can send home.',
    why: 'You can plan help for your family after your costs.',
    todo: 'Type your salary and costs. You see the amount in manat.',
  },
  '/real-salaries': {
    what: 'This page shows real salaries of our workers.',
    why: 'You see what people in your job really earn.',
    todo: 'Pick your job and city and look at the ranges.',
  },
  '/health-insurance-comparison': {
    what: 'This page compares health insurance funds.',
    why: 'Funds cost different amounts. You can save money.',
    todo: 'Type your salary and find the cheapest fund.',
  },
  // plan the move
  '/when-in-germany': {
    what: 'This tool estimates when you can be in Germany.',
    why: 'You can plan your job, flat and family in time.',
    todo: 'Answer the questions and look at your timeline.',
  },
  '/permanent-residence': {
    what: 'This tool shows when you can stay in Germany for good.',
    why: 'You see the earliest dates for permanent stay and citizenship.',
    todo: 'Type your arrival date and your situation.',
  },
  '/five-years-in-germany': {
    what: 'This page shows your next five years in Germany.',
    why: 'You see salary, savings and your residence steps year by year.',
    todo: 'Pick your job and city and move through the years.',
  },
  '/which-city': {
    what: 'This quiz finds a German city for you.',
    why: 'Cities differ in rent, jobs and life.',
    todo: 'Answer eight questions and see your city.',
  },
  '/residence-card-explained': {
    what: 'This page explains the German residence card.',
    why: 'You understand every field on your card.',
    todo: 'Click a field on the sample card to read about it.',
  },
  '/calculator': {
    what: 'This tool estimates when you can start work in Germany.',
    why: 'You can plan your move and tell your employer.',
    todo: 'Choose your visa type and see the estimate.',
  },
  '/cities': {
    what: 'This page compares German cities.',
    why: 'You see rent, transport and food costs in each city.',
    todo: 'Pick cities and compare them.',
  },
  '/events': {
    what: 'This page lists our free events and webinars.',
    why: 'You can ask questions and learn more about Germany.',
    todo: 'Pick an event and sign up.',
  },
  '/status': {
    what: 'This page shows the stage of your application.',
    why: 'You can check it without logging in.',
    todo: 'Type your case number and your date of birth.',
  },
  '/changes-2027': {
    what: 'This page lists what changes in Germany in 2027.',
    why: 'New rules can change your pay, taxes or visa.',
    todo: 'Read the list. Each item shows the old and the new value.',
  },
  // life in Germany
  '/life-in-germany': {
    what: 'This tool shows life in Germany in numbers.',
    why: 'You see salary, rent, costs and savings for your job and city.',
    todo: 'Pick your job and city and look at the results.',
  },
  '/driving-licence-germany': {
    what: 'This page explains your driving licence in Germany.',
    why: 'Your licence from home is valid only for a short time.',
    todo: 'Read the steps and see the tests and costs.',
  },
  '/german-apartment': {
    what: 'This is a virtual German flat.',
    why: 'You learn the house rules, like heating, airing and bins.',
    todo: 'Click the things in the flat and read the tips.',
  },
  '/apartment-viewing': {
    what: 'This page lets you practise a flat viewing in German.',
    why: 'You learn what to say and how to spot scams.',
    todo: 'Play the viewing, then fill in the tenant form as a PDF.',
  },
  '/german-street': {
    what: 'This is a virtual German street.',
    why: 'You practise places like the office, bank and doctor.',
    todo: 'Click a building to open a game or scene.',
  },
  '/holiday-planner': {
    what: 'This tool shows public holidays and bridge days.',
    why: 'You can plan more days off with fewer leave days.',
    todo: 'Choose your state and year. Save the calendar if you like.',
  },
  '/advent-calendar': {
    what: 'This is a German Advent calendar.',
    why: 'You learn Christmas traditions and new German phrases.',
    todo: 'Open one door each day from 1 to 24 December.',
  },
  '/weekend-trips': {
    what: 'This page shows day trips by regional train.',
    why: 'You can see Germany cheaply with the Deutschlandticket.',
    todo: 'Pick your city and choose a trip.',
  },
  '/driving-time-calculator': {
    what: 'This tool checks driving and rest times for truck drivers.',
    why: 'Breaking the rules can mean high fines.',
    todo: 'Type your driving and rest hours for the week.',
  },
  '/work-schedule-check': {
    what: 'This tool checks if your shift plan is legal.',
    why: 'Germany has rules for work hours, breaks and rest.',
    todo: 'Type your shifts and see the result.',
  },
  '/emergency-wallpaper': {
    what: 'This tool makes an emergency picture for your phone.',
    why: 'In an emergency, help sees the key numbers at once.',
    todo: 'Fill in your details and download the picture.',
  },
  '/pocket-guide': {
    what: 'This is a small printable guide to Germany.',
    why: 'You have emergency numbers and key phrases on paper.',
    todo: 'Download the PDF and print it.',
  },
  // explore
  '/map': {
    what: 'This map shows where our workers live in Germany.',
    why: 'You see the cities where people like you work.',
    todo: 'Move the map and click a city.',
  },
  '/azerbaijan-in-germany': {
    what: 'This page lists Azerbaijani places in Germany.',
    why: 'You find the embassy, groups and community near you.',
    todo: 'Look at the map or the list and open a place.',
  },
  '/guides': {
    what: 'This page has our guides and articles.',
    why: 'You learn about visas, diplomas and moving in detail.',
    todo: 'Pick a topic and read the guide.',
  },
  '/glossary': {
    what: 'This is a dictionary of German office words.',
    why: 'Letters and offices use many hard words.',
    todo: 'Search a word and read the simple explanation.',
  },
  '/shortage-barometer': {
    what: 'This page shows where Germany needs workers.',
    why: 'You see where your job is wanted most.',
    todo: 'Pick your job and look at the map.',
  },
  '/jobs': {
    what: 'This page lists open jobs in Germany.',
    why: 'You can find work and apply.',
    todo: 'Filter by job or city and open a vacancy.',
  },
  '/visas': {
    what: 'This page lists all work visa types.',
    why: 'You see what each visa needs.',
    todo: 'Open a visa type and read the details.',
  },
  // learn German (games, exams, scenes)
  '/german-mock-exam': {
    what: 'This page has practice German exams.',
    why: 'You get used to the real exam before the test day.',
    todo: 'Choose level A1 or B1 and start.',
  },
  '/german-mock-exam/a1': {
    what: 'This is a practice German exam at level A1.',
    why: 'You see how ready you are for the real exam.',
    todo: 'Do listening, reading, writing and speaking. Watch the timer.',
  },
  '/german-mock-exam/b1': {
    what: 'This is a practice German exam at level B1.',
    why: 'You see how ready you are for the real exam.',
    todo: 'Do all four parts and look at your points.',
  },
  '/german-level-test-self': {
    what: 'This page helps you find your German level.',
    why: 'You know where you stand and what to learn next.',
    todo: 'Answer the questions about what you can do.',
  },
  '/german-simulator': {
    what: 'This game practises German talks at offices and work.',
    why: 'You learn what to say in real life.',
    todo: 'Read the dialogue and pick the right answer.',
  },
  '/pronunciation': {
    what: 'This tool trains your German pronunciation.',
    why: 'Good pronunciation helps people understand you.',
    todo: 'Listen to a sentence, then say it into the microphone.',
  },
  '/price-game': {
    what: 'This game asks you to guess prices in Germany.',
    why: 'You learn what things cost before you arrive.',
    todo: 'Guess the price in each round.',
  },
  '/traffic-signs': {
    what: 'This page teaches German traffic signs.',
    why: 'You need them for driving and for the driving test.',
    todo: 'Learn the signs, then take the test.',
  },
  '/waste-sorting': {
    what: 'This game teaches how to sort rubbish in Germany.',
    why: 'In Germany you must put waste in the right bin.',
    todo: 'Put each item in the right bin before time runs out.',
  },
  '/ticket-machine': {
    what: 'This is a practice ticket machine.',
    why: 'Without the right ticket you pay a fine.',
    todo: 'Do the tasks and buy the right ticket.',
  },
  '/supermarket-game': {
    what: 'This game is a German supermarket.',
    why: 'You learn food words and how shopping works.',
    todo: 'Find the items on your list and pay.',
  },
  '/workplace-etiquette': {
    what: 'This quiz is about good behaviour at work in Germany.',
    why: 'Work rules in Germany may differ from home.',
    todo: 'Read each situation and pick the best answer.',
  },
  '/work-scenes': {
    what: 'This page shows pictures of workplaces with German words.',
    why: 'You learn the words you need at work.',
    todo: 'Pick a workplace to open it.',
  },
  '/work-scenes/restaurant-kitchen': {
    what: 'This picture shows a restaurant kitchen.',
    why: 'You learn the kitchen words you need at work.',
    todo: 'Click things in the picture, listen and do the quiz.',
  },
  '/work-scenes/truck-cab': {
    what: 'This picture shows a truck cab.',
    why: 'You learn the words a truck driver needs.',
    todo: 'Click things in the picture, listen and do the quiz.',
  },
  '/work-scenes/hospital-ward': {
    what: 'This picture shows a hospital ward.',
    why: 'You learn the words you need in care work.',
    todo: 'Click things in the picture, listen and do the quiz.',
  },
  '/work-scenes/construction-site': {
    what: 'This picture shows a building site.',
    why: 'You learn the words and safety rules for the site.',
    todo: 'Click things in the picture, listen and do the quiz.',
  },
  '/work-scenes/electrical-panel': {
    what: 'This picture shows a fuse box.',
    why: 'You learn the words an electrician needs.',
    todo: 'Click things in the picture, listen and do the quiz.',
  },
  // employers
  '/employer-cost-calculator': {
    what: 'This tool shows what a worker costs an employer.',
    why: 'Employers pay more than the gross salary.',
    todo: 'Type the gross salary and look at the total cost.',
  },
  '/employer-guide-azerbaijan': {
    what: 'This guide is for employers who hire from Azerbaijan.',
    why: 'You learn about schools, diplomas and holidays there.',
    todo: 'Read the parts that matter to you.',
  },
  '/kandidaten': {
    what: 'This page lists candidates who want to work in Germany.',
    why: 'Employers can find suitable workers.',
    todo: 'Filter by job and German level, then contact us.',
  },
  '/novruz-card': {
    what: 'This tool makes a Novruz greeting card.',
    why: 'You can greet your Azerbaijani team on their holiday.',
    todo: 'Choose a design and download the card.',
  },

  // client portal
  '/account': {
    what: 'This is the home page of your client area.',
    why: 'You see your next step and how far your application is.',
    todo: 'Do the task in the top card first.',
  },
  '/account/cases': {
    what: 'This page lists all your applications.',
    why: 'You see your own and your family members’ applications.',
    todo: 'Click an application to open it.',
  },
  '/account/cases/:id': {
    what: 'This page shows one application.',
    why: 'You see its stage, documents and what is still needed.',
    todo: 'Check the open tasks and upload missing documents.',
  },
  '/account/cases/:id/forms/:formId': {
    what: 'This is a form from our team.',
    why: 'We need your answers to prepare your documents.',
    todo: 'Fill in all fields and send the form.',
  },
  '/account/cases/:id/confirm': {
    what: 'This page shows your details for the embassy papers.',
    why: 'A wrong detail can cause problems with your visa.',
    todo: 'Check each value. Mark it correct or fix it.',
  },
  '/account/notifications': {
    what: 'This page lists all your notifications.',
    why: 'You don’t miss news about your application.',
    todo: 'Read new items and mark them as read.',
  },
  '/account/profile': {
    what: 'This page has your personal details and settings.',
    why: 'Correct details help us reach you and prepare papers.',
    todo: 'Check your details and save changes.',
  },
  '/account/applications': {
    what: 'This page lists the jobs you applied for.',
    why: 'You see where each application stands.',
    todo: 'Open an application to see its status.',
  },
  '/account/saved-jobs': {
    what: 'This page shows the jobs you saved.',
    why: 'You can come back to them later.',
    todo: 'Open a job or set up a job alert.',
  },
  '/account/job-applications': {
    what: 'This page shows the jobs you applied for through us.',
    why: 'You see the status of each application.',
    todo: 'Check the steps of each application.',
  },
  '/account/onboarding': {
    what: 'This page lists your first steps in Germany.',
    why: 'Some tasks have deadlines after you arrive.',
    todo: 'Do each task and tick it off.',
  },
  '/account/housing': {
    what: 'This page helps you find a flat and register your address.',
    why: 'You need an address to register in Germany.',
    todo: 'Follow the checklist and add your rental details.',
  },
  '/account/german': {
    what: 'This page is about your German.',
    why: 'Many visas and jobs need German.',
    todo: 'Test your level, pick a course and upload your certificate.',
  },
  '/account/interviews': {
    what: 'This page lists your job interviews.',
    why: 'You don’t miss an interview with an employer.',
    todo: 'Confirm or decline a time and join on the day.',
  },
  '/account/privacy': {
    what: 'This page is about your data and privacy.',
    why: 'You decide what we may do with your data.',
    todo: 'Check your consents and send a request if you need one.',
  },
  '/account/waiting-room': {
    what: 'This page has lessons for your waiting time.',
    why: 'You can prepare for Germany while you wait.',
    todo: 'Open a lesson, watch a video or do an exercise.',
  },
  '/account/course': {
    what: 'This page lists your preparation courses.',
    why: 'The courses help you get ready for Germany.',
    todo: 'Choose a course to start.',
  },
  '/account/course/:courseId': {
    what: 'This page shows one course and its lessons.',
    why: 'You see your progress in the course.',
    todo: 'Open the next lesson.',
  },
  '/account/course/:courseId/lesson/:lessonId': {
    what: 'This is one lesson of your course.',
    why: 'Each lesson teaches you something new.',
    todo: 'Go through the lesson and do the quiz.',
  },
  '/account/guides': {
    what: 'This page has tips for your current step.',
    why: 'You know what matters right now.',
    todo: 'Read the tips and open a guide.',
  },
  '/account/cv': {
    what: 'This page helps you write your CV.',
    why: 'Employers want a CV in the German style.',
    todo: 'Fill in your details and download your CV.',
  },
  '/account/letters/*': {
    what: 'This page helps you with cover letters.',
    why: 'A good letter helps you get a job.',
    todo: 'Choose a job and make your letter.',
  },
  '/account/letters-explain': {
    what: 'This page explains German letters to you.',
    why: 'Official letters are often hard to understand.',
    todo: 'Upload a photo or PDF of the letter and read the explanation.',
  },
  '/account/vault': {
    what: 'This is your safe place for documents.',
    why: 'You upload a document once and use it again.',
    todo: 'Upload your documents. We remind you before they expire.',
  },
  '/account/referral': {
    what: 'This page has your link to invite friends.',
    why: 'Your friends can start their way to Germany too.',
    todo: 'Copy your link or QR code and send it to friends.',
  },
  '/account/arrival': {
    what: 'This page is your arrival plan.',
    why: 'Flight, pickup and first place to stay must be ready.',
    todo: 'Add your flight details and check the plan.',
  },
  '/account/arrival-prep': {
    what: 'This page lists what to do before and after arrival.',
    why: 'Some tasks have deadlines after you arrive.',
    todo: 'Tick off each task when it is done.',
  },
  '/account/arrival-card': {
    what: 'This is your digital arrival card.',
    why: 'Your address, employer and help numbers are on one page.',
    todo: 'Save it on your phone so it works offline.',
  },
  '/account/readiness': {
    what: 'This page shows how ready you are for Germany.',
    why: 'You see what is good and what still needs work.',
    todo: 'Do the next step shown under each part.',
  },
  '/account/germany-ready': {
    what: 'This page collects your practice points.',
    why: 'You see your progress in games and lessons.',
    todo: 'Do the weekly challenge and earn your certificate.',
  },
  '/account/future-letter': {
    what: 'Here you write a letter to your future self.',
    why: 'You read it again when you arrive in Germany.',
    todo: 'Write your letter and save it.',
  },
  '/account/rate-alerts': {
    what: 'This page sets alerts for the euro to manat rate.',
    why: 'You know a good time to send money home.',
    todo: 'Choose a rate. We send you an e-mail when it is reached.',
  },
  '/account/pocket-guide': {
    what: 'This is your personal pocket guide to Germany.',
    why: 'Your own details and help numbers are on paper.',
    todo: 'Download the PDF and print it.',
  },
  '/account/emergency-wallpaper': {
    what: 'This tool makes an emergency picture for your phone.',
    why: 'In an emergency, help sees the key numbers at once.',
    todo: 'Check your details and download the picture.',
  },
  '/account/badges': {
    what: 'This page shows your badges.',
    why: 'You see what you have already done.',
    todo: 'Look at the open badges and how to get them.',
  },
  '/account/visa-story/:caseId': {
    what: 'This is the story of your visa in pictures.',
    why: 'You see your journey to the visa in numbers.',
    todo: 'Click through the slides. You can save the last card.',
  },
  '/account/rule-changes': {
    what: 'This page lists rule changes for your visa type.',
    why: 'New rules can change what you need.',
    todo: 'Read the changes and ask us if anything is unclear.',
  },
  '/account/checklist': {
    what: 'This page lists all documents for your visa.',
    why: 'You see what you need and how to get it.',
    todo: 'Open each document, read the tips and upload it.',
  },
  '/account/budget': {
    what: 'This page plans your money for the first month.',
    why: 'The first salary comes late, and rent and deposit come first.',
    todo: 'Check the numbers and see how much money to bring.',
  },
  '/account/interview-prep': {
    what: 'This page helps you practise for an interview.',
    why: 'Practice makes you calm and ready.',
    todo: 'Open a question, answer it and read the sample answer.',
  },
  '/account/signatures': {
    what: 'This page lists documents for you to sign.',
    why: 'Your process goes on only after you sign.',
    todo: 'Open a document, read it and sign.',
  },
  '/account/signatures/:signerId': {
    what: 'This is a document for you to sign.',
    why: 'Your process goes on only after you sign.',
    todo: 'Read the document carefully, then sign it.',
  },
  '/account/payments': {
    what: 'This page shows your invoices and payments.',
    why: 'You see what is paid and what is still open.',
    todo: 'Open an invoice to see the bank details.',
  },
  '/account/all': {
    what: 'This page lists all parts of your portal.',
    why: 'Here you find parts that are not in the menu.',
    todo: 'Pick the part you need and open it.',
  },
};
