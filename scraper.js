const cheerio = require('cheerio');
const fs = require('fs');
const bigInt = require("big-integer");
const { Map, OrderedSet } = require('immutable');
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);

let accName, numOfTweets, counter, filename, noReplies;
noReplies = true;
counter = 0;
filename = "./tweets.json";

for(let i=0;i<args.length;i++){
    if(args[i] === "-l"){
        if(args[i+1] > 0){
            numOfTweets = parseInt(args[i+1]);
        }
    }
    if(args[i] === "-n"){
        if(args[i+1].length > 0){
            accName = args[i+1];
        }
    }
    if(args[i] === "-r"){
        noReplies = false;
    }
    if(args[i] === "--filename"){
        if(args[i+1].length > 0){
           filename = `./${args[i+1]}.json`
        }
    }
}

function arrayToSet(arr){
    let data = arr.map((obj) => {
        return Map(obj);
    });
    data = OrderedSet(data);
    return data;
}

function dateToString(date){
    let year = date.getFullYear();
    let month = date.getMonth();
    let day = date.getDate();
    dateString = `${year}-${('0'+(month+1)).slice(-2)}-${('0'+day).slice(-2)}`;
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

function downloadBody(){
    const data = document.querySelector('main');
    return data.outerHTML;
}

function extractItems(body, name){
    let items = OrderedSet();
    const $ = cheerio.load(body);
    $('article[aria-haspopup="false"][role="article"]').each(async (i, el) => {
        let tweetHtml = $.html(el);
        if(tweetHtml.search(/role="blockquote"/) == -1){    //not a quote
            let $$ = cheerio.load(tweetHtml);
            let text = $$('div[lang][dir="auto"]').text();
            let href = $$(`a[title][href^="/${name}/status/"]`).attr('href');
            if(href && text.length > 0){
                href = href.split('/');
                let date = idToDate(href[3]);
                let dateString = date.toISOString();
                let tweetObj = {text: text, date: dateString, id: href[3]};
                const tweetMap = Map(tweetObj);
                items = items.add(tweetMap);
            }
        }
    });
    return items;
}

async function infiniteScroll(page, num, name){
    let items = OrderedSet();
    let body;
    try{
        let previousHeight;
        while (items.size < num) {
            body = await page.evaluate(downloadBody);
            let itemsArr = await extractItems(body, name);
            items = items.union(itemsArr);
            console.log(`Got ${items.size} of ${num} remaining tweets`);
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`, {timeout: 3000});
            await page.waitFor(1000);
        }
        return items;
    }
    catch(e){
        if(e.name == 'TimeoutError'){
            console.log('Timeout or limit experienced. The browser will restart and continue scraping');
            return items;
        }
    }
}

function scrape(url, num, name){
    return new Promise(async (resolve, reject) => {
        try {
            const browser = await puppeteer.launch({headless: true});
            const context = await browser.createIncognitoBrowserContext();
            const page = await context.newPage();
            page.setViewport({ width: 1280, height: 926 });
            await page.goto(url);
            await page.waitFor('main', {timeout: 7000});
            await page.waitFor(3000);
            let data = await infiniteScroll(page, num, name);
            browser.close();
            resolve(data);
        } catch (e) {
            if(e.name == 'TimeoutError'){
                console.log('Timeout or limit experienced. The browser will restart and continue scraping');
                if(browser){
                    browser.close();
                }
                let emptySet = OrderedSet();
                resolve(emptySet);
            }
            else{
                reject(e);
            }
        }
    });
}

async function getTweets(number = 10, name = "CNN"){
    let totalNum = number;
    let data;
    let fileContent = OrderedSet();
    let dateString = '';
    let noRepliesString = '%20-filter%3Areplies';
    let noRetweetsString = '%20-filter%3Anativeretweets';
    if(fs.existsSync(filename)){
        let jsonData = fs.readFileSync(filename);
        fileContent = JSON.parse(jsonData);
        fileContent = fileContent[0];
        let lastTweet = fileContent[fileContent.length - 1];
        let date = new Date(lastTweet.date);
        date.setDate(date.getDate()+1);
        dateString = `%20until%3A${dateToString(date)}`;
        fileContent = arrayToSet(fileContent);
    }
    let url = `https://twitter.com/search?q=from%3A${name}${dateString}${noRetweetsString}&src=typed_query&f=live`;
    if(noReplies){
        url = `https://twitter.com/search?q=from%3A${name}${dateString}${noRepliesString}${noRetweetsString}&src=typed_query&f=live`;
    }
    number = number - fileContent.size > 0 ? number - fileContent.size : 0;
    if(number > 0){
        data = await scrape(url, number, name);
        let remainingTweets = number - data.size;
        let limitCounter = 0;
        while(data.size < number){
            let dataArray = data.toArray();
            let lastTweet = dataArray[dataArray.length - 1].toJS();
            let date = new Date(lastTweet.date);
            date.setDate(date.getDate()+1); // set the next day to not miss any tweets
            // let year = date.getFullYear();
            // let month = date.getMonth();
            // let day = date.getDate();
            // dateString = `${year}-${('0'+(month+1)).slice(-2)}-${('0'+day).slice(-2)}`;
            dateString = dateToString(date);
            dateString = `%20until%3A${dateString}`;
            url = `https://twitter.com/search?q=from%3A${name}${dateString}${noRetweetsString}&src=typed_query&f=live`;
            if(noReplies){
                url = `https://twitter.com/search?q=from%3A${name}${dateString}${noRepliesString}${noRetweetsString}&src=typed_query&f=live`;
            }
            let newData = await scrape(url, remainingTweets, name);
            let sizeBefore = data.size;
            data = data.union(newData);
            let sizeAfter = data.size;
            remainingTweets = number - data.size;
            if(sizeBefore == sizeAfter){
                remainingTweets += 200; //to avoid looping over the same tweets
                limitCounter++;
            }
            else{
                limitCounter = 0;
            }
            if(limitCounter > 2){
                console.log('Could not find more tweets, saving...');
                break;
            }
        }
        let numOfScraped = data.size;
        fileContent = fileContent.union(data);
        fileContent = fileContent.toArray();
        let numToDelete = fileContent.length - totalNum;
        if(numToDelete > 0){
            for(let i=0;i<numToDelete;i++){
                fileContent.pop();
            }
        }
        console.log(`Tweets scraped: ${numOfScraped}`);
        console.log(`Total tweets: ${fileContent.length}`);
        console.log('Saving...');
        fs.writeFileSync(filename, JSON.stringify([fileContent, name]));
    }
}

getTweets(numOfTweets, accName)