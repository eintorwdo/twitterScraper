const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const bigInt = require("big-integer");

const args = process.argv.slice(2);

let accName, numOfTweets, counter, append, filename;
let tweetArr = [];
counter = 0;
append = false;
filename = "./tweets.json"

for(let i=0;i<args.length;i++){
    if(args[i] === "-l"){
        numOfTweets = parseInt(args[i+1]);
    }
    if(args[i] === "-n"){
        accName = args[i+1];
    }
    if(args[i] === "-a"){
        append = true;
        if(args[i+1] && args[i+1].length > 0){
            filename = args[i+1];
        }
    }
}

function parseBatch($, num){
    if($('body').has('.timeline').length){
        $('.timeline .tweet').each((i, el) => {
            if(counter < num){
                let tweetHtml = $.html(el);
                let test = tweetHtml.search(/<span class="context">[^]* retweeted<\/span>/);
                if(test === -1){
                    let $$ = cheerio.load(tweetHtml);
                    let tweetCore = $$('.dir-ltr');
                    let coreHtml = $$.html(tweetCore);
                    let tweetID = bigInt($$('.tweet-text').attr('data-id'));
                    tweetID = tweetID.shiftRight(22);
                    let offset = 1288834974657;
                    let tstamp = tweetID.add(offset);
                    let date = new Date(parseInt(tstamp.toString()));
                    let localDate = convertUTCDateToLocalDate(date);
                    let text = $$(`${coreHtml}`).not('a').text();
                    text = text.replace(/\n/g, ' ');
                    text = text.replace(/\\/, '');
                    text = text.replace(/"/g, "'");
                    let tweetObj = {
                        text: text.trim(),
                        date: localDate.toString()
                    }
                    tweetArr.push(tweetObj);
                    counter++;
                    console.log(`Tweets parsed: ${counter}/${num}`);
                }
            }
        });
    }
}

function scrape(url, num){
    return new Promise(async (resolve, reject) => {
        try {
            const response = await axios.get(url, {headers: {'User-Agent': 'Mozilla/5.0 (Linux; Android 4.1; Nexus 7 Build/JRN84D) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Safari/535.19'}});
            const data = response.data;
            const $ = cheerio.load(data);
            setTimeout(() => {
                parseBatch($, num);
                let morePath = $('.w-button-more a').attr('href');
                let moreTweetsURL = morePath ? `https://mobile.twitter.com${morePath}` : undefined;
                console.log(moreTweetsURL);
                resolve(moreTweetsURL);
            }, 1000);
        } catch (error) {
            reject(error)
        }
    });
}

async function getTweets(number = 10, name = "CNN"){
    let url = `https://mobile.twitter.com/${name}`;
    let tweets;
    if(append){
        let tw = fs.readFileSync(filename);
        tweets = JSON.parse(tw);
        url = tweets[1];
    }
    while(counter < number){
        var res = await scrape(url, number);
        if(res){
            url = res;
        }
    }
    if(!append){
        fs.writeFileSync(filename, JSON.stringify([tweetArr, res]));
        console.log(tweetArr)
    }
    else{
        tweets[0].push(...tweetArr);
        fs.writeFileSync(filename, JSON.stringify([tweets[0], res]));
        console.log(tweets[0]);
    }
}

function convertUTCDateToLocalDate(date) {
    let newDate = new Date(date.getTime()+date.getTimezoneOffset()*60*1000);

    let offset = date.getTimezoneOffset() / 60;
    let hours = date.getHours();

    newDate.setHours(hours - offset);

    return newDate;   
}

getTweets(numOfTweets, accName)