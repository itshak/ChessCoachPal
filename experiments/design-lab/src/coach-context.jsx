import {useState} from "react";
import {students,sessions} from "../../../app/design-lab/fixtures.ts";
const words={
 en:{profile:"Student profile",workplaces:"Workplaces",alias:"Alias",status:"Status",active:"Active",archived:"Archived",ratings:"Ratings",contact:"Contact",history:"Learning history",materials:"Teaching materials",verified:"Verified example",next:"Next action",plan:"Lesson preparation",group:"Group lesson",individual:"Individual lesson",homework:"Homework overdue",billing:"Billing review",attendance:"Attendance missing",open:"Open lesson",review:"Review student",todo:"Follow-up queue",complete:"Reviewed",undo:"Reopen",context:"Context inspector",focus:"Next lesson",note:"Synthetic fixture only",source:"Source",nextLesson:"Next lesson focus",cross:"Also teaches at",draft:"Draft retained",typography:"Typography",system:"System sans",editorial:"Editorial serif headings"},
 he:{profile:"פרופיל תלמיד",workplaces:"מקומות עבודה",alias:"כינוי",status:"מצב",active:"פעיל",archived:"בארכיון",ratings:"דירוגים",contact:"פרטי קשר",history:"היסטוריית למידה",materials:"חומרי לימוד",verified:"דוגמה מאומתת",next:"פעולה הבאה",plan:"הכנת שיעור",group:"שיעור קבוצתי",individual:"שיעור פרטי",homework:"שיעורי בית באיחור",billing:"בדיקת חיוב",attendance:"חסרה נוכחות",open:"פתיחת שיעור",review:"סקירת תלמיד",todo:"משימות מעקב",complete:"נבדק",undo:"פתיחה מחדש",context:"פרטי הקשר",focus:"השיעור הבא",note:"נתוני דמה בלבד",source:"מקור",nextLesson:"מוקד השיעור הבא",cross:"גם במקום",draft:"טיוטה נשמרה",typography:"טיפוגרפיה",system:"גופן מערכת",editorial:"כותרות סריפ"},
 ru:{profile:"Профиль ученика",workplaces:"Места работы",alias:"Псевдоним",status:"Статус",active:"Активен",archived:"В архиве",ratings:"Рейтинги",contact:"Контакт",history:"История обучения",materials:"Учебные материалы",verified:"Проверенный пример",next:"Следующее действие",plan:"Подготовка к уроку",group:"Групповой урок",individual:"Индивидуальный урок",homework:"Просрочено задание",billing:"Проверка оплаты",attendance:"Нет отметки посещения",open:"Открыть урок",review:"Открыть ученика",todo:"Очередь задач",complete:"Проверено",undo:"Открыть снова",context:"Контекст",focus:"Следующий урок",note:"Только тестовые данные",source:"Источник",nextLesson:"Тема следующего урока",cross:"Также обучается в",draft:"Черновик сохранён",typography:"Типографика",system:"Системный шрифт",editorial:"Заголовки с засечками"}
};
export const contextWords=locale=>words[locale]||words.en;
const details={
 s1:{workplaces:["Club","Private"],chesscom:1480,contact:"daniel@example.invalid",next:"Practice Lucena without hints",materials:["Lucena position","Rook endgame checklist"]},
 s2:{workplaces:["Private"],chesscom:1080,contact:"maya@example.invalid",next:"Review pawn opposition",materials:["Opposition","Pawn endgame exercise"]},
 s3:{workplaces:["Club"],chesscom:1280,contact:"alexey@example.invalid",next:"Solve fork exercises",materials:["Knight forks","Tactical motifs"]},
 s4:{workplaces:["Private"],chesscom:940,contact:"noa@example.invalid",next:"Review basic mates if restored",materials:["Basic mates"]}
};
export const studentWorkplaces=id=>details[id]?.workplaces||[];
export function StudentProfile({student,t,locale}){
 if(!student)return null;const w=contextWords(locale),d=details[student.id];
 return <section className="profile-detail" aria-label={w.profile}>
   <h3>{w.profile}</h3><dl className="profile-facts">
   <div><dt>{w.alias}</dt><dd><bdi>{student.alias}</bdi></dd></div><div><dt>{w.status}</dt><dd>{student.archived?w.archived:w.active}</dd></div>
   <div><dt>{w.workplaces}</dt><dd>{d.workplaces.join(" · ")}</dd></div><div><dt>{w.contact}</dt><dd><bdi>{d.contact}</bdi></dd></div>
   <div><dt>{w.ratings}</dt><dd>Lichess {student.rating} · Chess.com {d.chesscom}</dd></div></dl>
   <h4>{w.materials}</h4><ul className="material-list">{d.materials.map(item=><li key={item}>{item}</li>)}</ul>
   <h4>{w.next}</h4><p>{d.next}</p><small>{w.note}</small>
 </section>;
}
export function Followups({locale,workplace,onLesson,onStudent}){
 const w=contextWords(locale),[done,setDone]=useState([]);
 const rows=[{id:"attendance",label:w.attendance,student:"s1",lesson:"l1",workplace:"Club"},{id:"homework",label:w.homework,student:"s2",lesson:"l2",workplace:"Private"},{id:"billing",label:w.billing,student:"s3",lesson:"l3",workplace:"Club"}].filter(r=>!workplace||r.workplace===workplace);
 return <section className="followups" aria-label={w.todo}><h3>{w.todo}</h3>{rows.map(r=><article key={r.id} data-reviewed={done.includes(r.id)}><div><strong>{r.label}</strong><small>{students.find(s=>s.id===r.student)?.name} · {r.workplace}</small></div><div className="followup-actions"><button type="button" onClick={()=>r.id==="attendance"?onLesson(r.lesson):onStudent(r.student)}>{r.id==="attendance"?w.open:w.review}</button><button type="button" aria-pressed={done.includes(r.id)} onClick={()=>setDone(old=>old.includes(r.id)?old.filter(x=>x!==r.id):[...old,r.id])}>{done.includes(r.id)?w.undo:w.complete}</button></div></article>)}</section>;
}
export function Preparation({session,locale,nextAction,onNextAction}){
 const w=contextWords(locale);return <section className="preparation"><h3>{w.plan}</h3><p>{session.participants.length>1?w.group:w.individual} · {session.time} · {session.workplace}</p><ul className="material-list">{session.participants.map(id=><li key={id}><strong>{students.find(s=>s.id===id)?.name}</strong><small>{details[id].materials[0]} · {w.verified}</small></li>)}</ul><label>{w.nextLesson}<input value={nextAction} onChange={e=>onNextAction(e.target.value)}/></label></section>;
}
export function Inspector({view,student,session,locale,t,onStudent,onLesson,workplace}){
 const w=contextWords(locale),next=sessions.find(s=>!workplace||s.workplace===workplace);
 return <aside className="inspector" aria-label={w.context}><h3>{w.context}</h3>{view==="today"?<><h4>{w.focus}</h4>{next&&<><strong>{next.time} · {next.title}</strong><p>{next.objective}</p><button onClick={()=>onLesson(next.id)}>{w.open}</button></>}</>:view==="lesson"?<><h4>{session.title}</h4><p>{session.objective}</p>{session.participants.map(id=><button key={id} onClick={()=>onStudent(id)}>{students.find(s=>s.id===id)?.name}</button>)}</>:student?<><h4><bdi>{student.name}</bdi></h4><p>{student.history}</p><p>{details[student.id].next}</p><small>{w.workplaces}: {details[student.id].workplaces.join(" · ")}</small></>:<p>{t.noResults}</p>}<small>{w.note}</small></aside>;
}
