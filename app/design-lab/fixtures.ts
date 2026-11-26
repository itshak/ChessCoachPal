// Synthetic, deterministic fixtures. Never import teacher services or real records here.
export type Tone = { bg: string; surface: string; fg: string; muted: string; accent: string; border: string };
export type Palette = { name: string; dark: Tone; light: Tone };
export const palettes: Palette[] = [
  {name:"Slate & Periwinkle",dark:{bg:"#222326",surface:"#2C2D32",fg:"#F4F5F8",muted:"#B8BBC8",accent:"#A6A7D8",border:"#606271"},light:{bg:"#F3F4F8",surface:"#FFFFFF",fg:"#262735",muted:"#55586A",accent:"#494B91",border:"#85879A"}},
  {name:"Graphite & Sage",dark:{bg:"#1E2020",surface:"#292C2B",fg:"#F1F0EA",muted:"#B5BDB7",accent:"#9BB6A3",border:"#59665E"},light:{bg:"#F1F4EF",surface:"#FFFFFF",fg:"#24332A",muted:"#505F55",accent:"#355B42",border:"#859389"}},
  {name:"Ink & Parchment",dark:{bg:"#211F1D",surface:"#302C28",fg:"#F1E8D9",muted:"#C9BDAE",accent:"#C3A982",border:"#706252"},light:{bg:"#F7F1E6",surface:"#FFFCF5",fg:"#302820",muted:"#695A48",accent:"#765326",border:"#A08A71"}},
  {name:"Charcoal & Clay",dark:{bg:"#252021",surface:"#33292B",fg:"#F7E9E7",muted:"#D4B9B7",accent:"#E4A69B",border:"#785C60"},light:{bg:"#FAEFED",surface:"#FFFFFF",fg:"#372528",muted:"#71565A",accent:"#8C3D40",border:"#A7898D"}},
  {name:"Mineral & Copper",dark:{bg:"#20272E",surface:"#29343D",fg:"#E9F1F5",muted:"#B6C5CF",accent:"#E0B18D",border:"#657682"},light:{bg:"#EDF3F5",surface:"#FFFFFF",fg:"#27343D",muted:"#526571",accent:"#87502E",border:"#8496A1"}},
  {name:"Olive & Lilac",dark:{bg:"#23271F",surface:"#30362B",fg:"#F0EFE5",muted:"#C1C7B4",accent:"#C9B6E6",border:"#69745D"},light:{bg:"#F2F3E9",surface:"#FFFFFF",fg:"#30382A",muted:"#5D6651",accent:"#654D8A",border:"#89937D"}},
  {"name":"Graphite & Iris","dark":{"bg":"#1C1D23","surface":"#272932","fg":"#F1F2F8","muted":"#BBC0D0","accent":"#B3A9E8","border":"#686C80"},"light":{"bg":"#F4F2F9","surface":"#FFFFFF","fg":"#292638","muted":"#5D586F","accent":"#58418F","border":"#868098"}},
  {"name":"Storm & Cornflower","dark":{"bg":"#202630","surface":"#2B3441","fg":"#F0F4FA","muted":"#BAC8DB","accent":"#92B6EA","border":"#6A7D96"},"light":{"bg":"#EDF2F9","surface":"#FFFFFF","fg":"#24354B","muted":"#506279","accent":"#315C99","border":"#8294AB"}},
  {"name":"Ash & Silver Lilac","dark":{"bg":"#262428","surface":"#312E35","fg":"#F5F1F7","muted":"#C7BDC9","accent":"#D1BDD9","border":"#766B7C"},"light":{"bg":"#F5F1F6","surface":"#FFFFFF","fg":"#342D39","muted":"#675A6B","accent":"#72527F","border":"#95839B"}},
  {name:"Current brand (reference)",dark:{bg:"#0B1322",surface:"#0D1829",fg:"#F8F2E8",muted:"#A5B2B8",accent:"#23B7AB",border:"#2E4854"},light:{bg:"#F8F2E8",surface:"#FFFFFF",fg:"#0B1322",muted:"#625E58",accent:"#0A6F69",border:"#D5CABE"}},
];
export const students = [
  {id:"s1",name:"Daniel Example",alias:"דני",strength:6,rating:1540,workplace:"Club",archived:false,history:"Lucena position — practiced with help"},
  {id:"s2",name:"Maya Sample",alias:"מאיה",strength:4,rating:1130,workplace:"Private",archived:false,history:"Opposition — demonstrated independently"},
  {id:"s3",name:"Алексей Тестов",alias:"Саша",strength:5,rating:1320,workplace:"Club",archived:false,history:"Forks — needs review"},
  {id:"s4",name:"Noa Demo",alias:"נועה",strength:3,rating:980,workplace:"Private",archived:true,history:"Basic mates — introduced"},
];
export const sessions = [
  {id:"l1",time:"15:00",title:"Endgame group",workplace:"Club",participants:["s1","s3"],objective:"Review rook endgames"},
  {id:"l2",time:"16:30",title:"Private lesson",workplace:"Private",participants:["s2"],objective:"Pawn endgame opposition"},
  {id:"l3",time:"18:00",title:"Tactics review",workplace:"Club",participants:["s1"],objective:"Knight forks"},
];
export function findStudents(query:string, includeArchived:boolean) {
  const q=query.trim().toLocaleLowerCase();
  return students.filter(s=>(includeArchived||!s.archived)&&[s.name,s.alias,s.workplace].some(v=>v.toLocaleLowerCase().includes(q)));
}
export function contrast(a:string,b:string) {
  const luminance=(hex:string)=>{
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
export const copy = {
 en:{lab:"Design laboratory",notice:"Synthetic preview · nothing is saved to the application",palette:"Palette",theme:"Theme",dark:"Dark",light:"Light",layout:"Layout",compact:"Compact rows",editorial:"Editorial desk",hybrid:"Command-first",density:"Density",normal:"Comfortable",dense:"Dense",font:"Typography",system:"System",inter:"Inter",language:"Language",today:"Today",students:"Students",lesson:"Lesson close",workplace:"Workplace",all:"All workplaces",search:"Search students or aliases",archived:"Include archived",details:"Student timeline",strength:"Strength",rating:"Lichess rating (synthetic)",attendance:"Attendance",present:"Present",objective:"Objective",privateNote:"Private coach note",sharedNote:"Shareable draft (not sent)",save:"Save local preview",saved:"Preview saved locally; no server write",pending:"Pending exceptions",exceptions:"Attendance missing · Homework overdue · Billing review",select:"Select lesson",required:"Enter a lesson objective",commands:"Search workspace (Ctrl/⌘ K)",close:"Close",foundation:"Native reference only — library candidates not yet integrated",noResults:"No matching students",reset:"Reset local draft"},
 he:{lab:"מעבדת עיצוב",notice:"תצוגה עם נתוני דמה בלבד · ללא שמירה במערכת",palette:"צבעים",theme:"ערכת נושא",dark:"כהה",light:"בהיר",layout:"פריסה",compact:"שורות קומפקטיות",editorial:"שולחן עבודה",hybrid:"מרחב פקודות",density:"צפיפות",normal:"מרווח",dense:"צפוף",font:"טיפוגרפיה",system:"מערכת",inter:"Inter",language:"שפה",today:"היום",students:"תלמידים",lesson:"סיום שיעור",workplace:"מקום עבודה",all:"כל המקומות",search:"חיפוש תלמידים או כינויים",archived:"כולל ארכיון",details:"היסטוריית תלמיד",strength:"רמה",rating:"דירוג ליצ'ס (דמה)",attendance:"נוכחות",present:"נוכח",objective:"מטרה",privateNote:"הערה פרטית למאמן",sharedNote:"טיוטה לשיתוף (לא נשלחה)",save:"שמירת תצוגה מקומית",saved:"הטיוטה נשמרה מקומית בלבד",pending:"נושאים לטיפול",exceptions:"חסרה נוכחות · שיעורי בית באיחור · בדיקת חיוב",select:"בחירת שיעור",required:"יש להזין מטרת שיעור",commands:"חיפוש במרחב העבודה (Ctrl/⌘ K)",close:"סגירה",foundation:"רכיבי בסיס מקומיים בלבד — הספריות טרם שולבו",noResults:"אין תלמידים תואמים",reset:"איפוס טיוטה"},
 ru:{lab:"Лаборатория дизайна",notice:"Синтетические данные · без записи в приложение",palette:"Палитра",theme:"Тема",dark:"Тёмная",light:"Светлая",layout:"Компоновка",compact:"Компактные строки",editorial:"Рабочий стол",hybrid:"Командный режим",density:"Плотность",normal:"Свободная",dense:"Плотная",font:"Типографика",system:"Системный",inter:"Inter",language:"Язык",today:"Сегодня",students:"Ученики",lesson:"Завершение урока",workplace:"Место работы",all:"Все места",search:"Поиск учеников и псевдонимов",archived:"Включить архив",details:"История ученика",strength:"Уровень",rating:"Рейтинг Lichess (пример)",attendance:"Посещаемость",present:"Присутствует",objective:"Цель",privateNote:"Личная заметка тренера",sharedNote:"Черновик для передачи (не отправлен)",save:"Сохранить локальный черновик",saved:"Черновик сохранён только локально",pending:"Требует внимания",exceptions:"Нет отметки посещения · Просрочено задание · Проверка оплаты",select:"Выбрать урок",required:"Укажите цель урока",commands:"Поиск в рабочей области (Ctrl/⌘ K)",close:"Закрыть",foundation:"Только нативный эталон — библиотеки ещё не подключены",noResults:"Ученики не найдены",reset:"Сбросить черновик"}
} as const;
