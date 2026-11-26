export const onlineRatingContextChanged="ccp:online-rating-context-changed";

export function notifyOnlineRatingContextChanged(studentId:string){
 window.dispatchEvent(new CustomEvent(onlineRatingContextChanged,{detail:studentId}));
}
