const bigInt = require("big-integer");

function dateToString(date){
    let year = date.getFullYear();
    let month = date.getMonth();
    let day = date.getDate();
    const dateString = `${year}-${('0'+(month+1)).slice(-2)}-${('0'+day).slice(-2)}`;
    return dateString;
}

function idToDate(id){
    let tweetID = bigInt(id);
    let IDShifted = tweetID.shiftRight(22);
    let offset = 1288834974657;
    let tstamp = IDShifted.add(offset);
    let date = new Date(parseInt(tstamp.toString()));
    return date
}

module.exports = {
    dateToString,
    idToDate
}