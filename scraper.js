const cheerio = require('cheerio');
const fs = require('fs');
const { Map, OrderedSet } = require('immutable');
const puppeteer = require('puppeteer');
const {dateToString, idToDate, generateSearchUrl} = require('./utils/utils.js');

const args = process.argv.slice(2);

let accName, numOfTweets, filename, noReplies;
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

function extractItems(body, name){
    let items = OrderedSet();
    const $ = cheerio.load(body);
    $('article[role="article"]').each((i, el) => {
        let tweetHtml = $.html(el);
        if(tweetHtml.search(/role="blockquote"/) == -1){    //not a quote
            const $$ = cheerio.load(tweetHtml);
            const text = $$('div[lang][dir="auto"]').text();
            let href = $$(`a[title][href^="/${name}/status/"]`).attr('href');
            if(href && text.length > 0){
                href = href.split('/');
                const date = idToDate(href[3]);
                const dateString = date.toISOString();
                const tweetObj = {text, date: dateString, id: href[3]};
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
    let previousHeight;
    try{
        while (items.size < num) {
            body = await page.evaluate(() => document.querySelector('main').outerHTML);
            let newItems = extractItems(body, name);
            items = items.union(newItems);
            console.log(`Got ${items.size} of ${num} remaining tweets`);
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`, {timeout: 3000});
            await page.waitFor(500);
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
        let browser;
        try {
            browser = await puppeteer.launch({headless: false});
            const context = await browser.createIncognitoBrowserContext();
            const page = await context.newPage();
            page.setViewport({ width: 1280, height: 926 });
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                if (request.resourceType() === 'image' || request.resourceType() === 'media') request.abort();  //do not load imgs or vids
                else request.continue();
            });
            await page.goto(url);
            await page.waitFor('main', {timeout: 7000});
            await page.waitFor(2000);
            let data = await infiniteScroll(page, num, name);
            browser.close();
            resolve(data);
        } catch (e) {
            if(e.name == 'TimeoutError'){
                console.log('Page did not load, the browser will try to restart');
                if(browser){
                    browser.close();
                }
                resolve(OrderedSet());
            }
            else{
                reject(e);
            }
        }
    });
}

(async function getTweets(number = 10, name = "CNN"){
    let url, newData, sizeBefore, lastTweet, lastTweetDate;
    let data = OrderedSet();
    let dateString = '';
    let noRepliesString = '%20-filter%3Areplies';
    let remainingTweets = number;
    let limitCounter = 0;
    if(number > 0){
        do{
            if(noReplies){
                url = generateSearchUrl(name, dateString, noRepliesString);
            }
            else{
                url = generateSearchUrl(name, dateString);
            }
            newData = await scrape(url, remainingTweets, name);
            sizeBefore = data.size;
            data = data.union(newData);
            lastTweet = data.last().toJS();
            lastTweetDate = new Date(lastTweet.date);
            lastTweetDate.setDate(lastTweetDate.getDate()+1); // set the next day to not miss any tweets
            dateString = `%20until%3A${dateToString(lastTweetDate)}`;
            remainingTweets = number - data.size;
            if(sizeBefore === data.size){
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
        } while(data.size < number);
        let numOfScraped = data.size;
        data = data.toArray();
        let numToDelete = data.length - number;
        if(numToDelete > 0){
            for(let i=0;i<numToDelete;i++){
                data.pop();
            }
        }
        console.log(`Tweets scraped: ${numOfScraped}`);
        console.log(`Total tweets: ${data.length}`);
        console.log('Saving...');
        fs.writeFileSync(filename, JSON.stringify([data, name]));
    }
})(numOfTweets, accName);