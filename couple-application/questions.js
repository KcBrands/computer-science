// The application form, transcribed from the "Girlfriend Application Form - 2026".
// Text in {braces} is filled in from the requester's settings (see WORDS in app.js),
// so the same form works whether they're looking for a girlfriend, boyfriend or partner.
//
// Question types:
//   text / textarea / number  - free answer
//   choice                    - pick one; an option may add a follow-up box (`more`)
//                               or count as a red flag in the email (`flag`)
//   ratings                   - several 1-10 self ratings
//   scale                     - a single 1-10 rating
// Questions are required unless marked `optional: true`.

window.FORM_SECTIONS = [
  {
    title: "Personal Information",
    number: 1,
    questions: [
      { id: "fullName", type: "text", label: "Full name" },
      { id: "age", type: "number", label: "Age" },
      { id: "from", type: "text", label: "Where are you from?" },
      { id: "occupation", type: "text", label: "Occupation" },
      { id: "contact", type: "text", label: "How can I reach you? (phone, Instagram or email)", optional: true },
      {
        id: "relStatus", type: "choice", label: "Relationship status",
        options: [
          { label: "Single" },
          { label: "Complicated", flag: true },
          { label: "\"We're basically broken up\"", flag: true },
          { label: "Other", more: "Explain" },
        ],
      },
      {
        id: "children", type: "choice", label: "Do you have children?",
        options: [{ label: "No" }, { label: "Yes", more: "How many?" }],
      },
      {
        id: "currentPartner", type: "choice", label: "Do you currently have a {me}/{spouse}/\"situationship\"?",
        options: [{ label: "No" }, { label: "Yes", flag: true }, { label: "It's complicated", flag: true }],
      },
    ],
  },
  {
    title: "Relationship History",
    number: 2,
    questions: [
      { id: "lastLength", type: "text", label: "How long was your last relationship?" },
      { id: "whyEnd", type: "textarea", label: "Why did it end?" },
      {
        id: "overEx", type: "choice", label: "Are you completely over your ex?",
        options: [{ label: "Yes" }, { label: "No", flag: true }, { label: "I still check their page sometimes", flag: true }],
      },
      {
        id: "talkEx", type: "choice", label: "Do you still communicate with your ex?",
        options: [{ label: "No" }, { label: "Yes", more: "Explain" }],
      },
      { id: "lesson", type: "textarea", label: "What did your previous relationship teach you?" },
    ],
  },
  {
    title: "Emotional Intelligence",
    number: 3,
    questions: [
      { id: "angry", type: "textarea", label: "When you're angry with your partner, what do you normally do?" },
      { id: "hurt", type: "textarea", label: "If your {me} tells you that something you did hurt {him}, what would you do?" },
      {
        id: "communicateUpset", type: "choice", label: "Can you communicate when you're upset instead of disappearing?",
        options: [
          { label: "Absolutely" },
          { label: "I need time, but I communicate" },
          { label: "I disappear for 3 business days", flag: true },
        ],
      },
      { id: "disagreements", type: "textarea", label: "How do you handle disagreements?" },
    ],
  },
  {
    title: "Communication Test",
    number: 4,
    questions: [
      {
        id: "busy", type: "choice", label: "Your {me} sends you a message and you're busy. What do you do?",
        options: [
          { label: "Ignore {him} until I'm free", flag: true },
          { label: "Tell {him} I'm busy and respond when I can" },
          { label: "Send a quick \"I'm busy, I'll text you later\"" },
          { label: "Depends on my mood", flag: true },
        ],
      },
      {
        id: "frequency", type: "choice", label: "How often do you like communicating with your partner?",
        options: [
          { label: "All day" },
          { label: "Throughout the day" },
          { label: "Morning & evening" },
          { label: "Whenever I remember", flag: true },
        ],
      },
      {
        id: "calls", type: "choice", label: "Are you comfortable with phone calls/video calls?",
        options: [{ label: "Yes" }, { label: "No" }, { label: "Depends who's calling", flag: true }],
      },
    ],
  },
  {
    title: "Red Flag Disclosure",
    number: 5,
    note: "Please answer HONESTLY. Lying on this section will result in immediate termination of application.",
    questions: [
      {
        id: "cheat", type: "choice", label: "Do you cheat?",
        options: [
          { label: "No" },
          { label: "Sometimes", flag: true },
          { label: "I believe \"it's not cheating if…\"", flag: true, more: "…if what?" },
        ],
      },
      {
        id: "entertain", type: "choice", label: "Do you entertain other {rivals} while in a relationship?",
        options: [{ label: "No" }, { label: "Sometimes", flag: true }, { label: "I just like attention", flag: true }],
      },
      {
        id: "flirt", type: "choice", label: "Do you flirt with other {rivals}?",
        options: [{ label: "No" }, { label: "Yes", flag: true }, { label: "Only when I'm bored", flag: true }],
      },
      {
        id: "angerIssues", type: "choice", label: "Do you have anger issues?",
        options: [{ label: "No" }, { label: "Sometimes", flag: true }, { label: "Yes - but I'm working on it", flag: true }],
      },
      {
        id: "lie", type: "choice", label: "Do you lie?",
        options: [{ label: "Never" }, { label: "Sometimes", flag: true }, { label: "Everyone lies", flag: true }],
      },
      { id: "biggestRedFlag", type: "textarea", label: "What is your biggest red flag?" },
    ],
  },
  {
    title: "{Role} Duties",
    number: 6,
    questions: [
      {
        id: "duties", type: "ratings", label: "Rate yourself from 1-10",
        items: [
          "Communication", "Loyalty", "Affection", "Romance", "Patience",
          "Emotional support", "Consistency", "Making your {me} laugh", "Planning dates",
        ],
      },
      { id: "goodRole", type: "textarea", label: "What does being a good {role} mean to you?" },
      { id: "lovedAppreciated", type: "textarea", label: "What would you do to make your {me} feel loved and appreciated?" },
    ],
  },
  {
    title: "Financial & Responsibility Check",
    number: 7,
    questions: [
      {
        id: "job", type: "choice", label: "Do you have a job/income?",
        options: [{ label: "Yes" }, { label: "No" }, { label: "Currently looking" }],
      },
      {
        id: "payDates", type: "choice", label: "How do you feel about paying for dates?",
        options: [
          { label: "I don't mind" },
          { label: "We can take turns" },
          { label: "50/50 always" },
          { label: "My {me} can pay" },
        ],
      },
      {
        id: "financiallyResponsible", type: "choice", label: "Are you financially responsible?",
        options: [{ label: "Yes" }, { label: "Trying my best" }, { label: "My bank account needs prayer" }],
      },
    ],
  },
  {
    title: "Love & Affection",
    number: 8,
    questions: [
      {
        id: "loveLanguage", type: "choice", label: "What is your love language?",
        options: [
          { label: "Words of affirmation" },
          { label: "Quality time" },
          { label: "Physical touch" },
          { label: "Acts of service" },
          { label: "Gifts" },
          { label: "All of the above" },
        ],
      },
      {
        id: "affectionate", type: "choice", label: "How affectionate are you?",
        options: [
          { label: "Very affectionate" },
          { label: "Moderately affectionate" },
          { label: "I'm shy" },
          { label: "Please don't touch me", flag: true },
        ],
      },
      {
        id: "givesReassurance", type: "choice", label: "Do you like giving your partner reassurance?",
        options: [{ label: "Yes" }, { label: "No", flag: true }, { label: "Only when necessary" }],
      },
      { id: "reassure", type: "textarea", label: "How would you reassure your {me} if {heWas} feeling insecure?" },
    ],
  },
  {
    title: "Jealousy & Boundaries",
    number: 9,
    questions: [
      { id: "jealousy", type: "scale", label: "How jealous are you from 1-10?" },
      {
        id: "phone", type: "choice", label: "Would you go through your {me}'s phone?",
        options: [{ label: "No" }, { label: "If I have a reason" }, { label: "Yes, I need to know everything", flag: true }],
      },
      {
        id: "friends", type: "choice", label: "Do you believe your {me} should have {friendKind} friends?",
        options: [{ label: "Yes" }, { label: "No" }, { label: "Depends on the friendship" }],
      },
      { id: "boundaries", type: "textarea", label: "What boundaries do you expect in a relationship?" },
    ],
  },
  {
    title: "Intentions",
    number: 10,
    questions: [
      { id: "whyApply", type: "textarea", label: "Why are you applying for this position?" },
      {
        id: "lookingFor", type: "choice", label: "What are you looking for?",
        options: [
          { label: "Serious relationship" },
          { label: "Something casual" },
          { label: "Friendship" },
          { label: "Marriage eventually" },
          { label: "I don't know yet" },
          { label: "I just think {heIs} cute" },
        ],
      },
      { id: "years", type: "textarea", label: "Where do you see yourself in 2-3 years?" },
      { id: "commitment", type: "textarea", label: "What does commitment mean to you?" },
      {
        id: "loyal", type: "choice", label: "Are you willing to be loyal, honest, consistent and intentional?",
        options: [{ label: "Yes" }, { label: "No", flag: true }, { label: "I need to think about it", flag: true }],
      },
    ],
  },
  {
    title: "Final Interview",
    questions: [
      { id: "fi1", type: "textarea", label: "1. Why should I choose you over the other applicants?" },
      { id: "fi2", type: "textarea", label: "2. What is one thing you can promise me as my {role}?" },
      { id: "fi3", type: "textarea", label: "3. What is something you would NEVER do to your {me}?" },
      { id: "fi4", type: "textarea", label: "4. What is your idea of a perfect date?" },
      { id: "fi5", type: "textarea", label: "5. If we had an argument, what would you do before going to sleep?" },
      { id: "fi6", type: "textarea", label: "6. If I'm having a terrible day, how would you make it better?" },
      { id: "fi7", type: "textarea", label: "7. What are your intentions with me specifically?" },
      { id: "fi8", type: "textarea", label: "8. Tell me one thing about yourself that I should know before considering your application." },
    ],
  },
  {
    title: "Accountability Test",
    number: 11,
    questions: [
      {
        id: "apologise", type: "choice", label: "Can you apologise without immediately following it with \"but you...\"?",
        options: [{ label: "Yes" }, { label: "No", flag: true }, { label: "I already feel attacked", flag: true }],
      },
    ],
  },
  {
    title: "Initiative Test",
    number: 12,
    questions: [
      {
        id: "planDate", type: "choice", label: "\"Plan a date\" means:",
        options: [
          { label: "Book something I know {he}'ll love" },
          { label: "Ask {him} 14 questions until {hePlans} it {himself}", flag: true },
          { label: "Say \"I'm easy, whatever you want\"", flag: true },
        ],
      },
    ],
  },
  {
    title: "The Final Question",
    questions: [
      {
        id: "finalQuestion", type: "textarea",
        label: "If you become my {role}, what can I expect from you that will make me feel safe, loved, respected and appreciated?",
      },
    ],
  },
];
