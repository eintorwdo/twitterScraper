const cheerio = require('cheerio');
const fs = require('fs');
const bigInt = require("big-integer");
const { Map, OrderedSet } = require('immutable');
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);

let accName, numOfTweets, counter, tweets, filename;
// let tweetArr = OrderedSet();
counter = 0;
filename = "./tweets.json"

for(let i=0;i<args.length;i++){
    if(args[i] === "-l"){
        numOfTweets = parseInt(args[i+1]);
    }
    if(args[i] === "-n"){
        accName = args[i+1];
    }
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
        if(tweetHtml.search(/role="blockquote"/) == -1 && tweetHtml.search(/<svg viewBox="0 0 0 24" aria-label/) == -1){
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
            console.log(items.size, 'of', num);
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
            const browser = await puppeteer.launch({headless: false});
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
                browser.close();
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
    let dateString = '';
    let url = `https://twitter.com/search?q=from%3A${name}${dateString}&src=typed_query&f=live`;
    let data;
    data = await scrape(url, number, name);
    let remainingTweets = number - data.size;
    while(data.size < number){
        let dataArray = data.toArray();
        let lastTweet = dataArray[dataArray.length - 1].toJS();
        let date = new Date(lastTweet.date);
        date.setDate(date.getDate()+1); // set the next day to not miss any tweets
        let year = date.getFullYear();
        let month = date.getMonth();
        let day = date.getDate();
        dateString = `${year}-${('0'+(month+1)).slice(-2)}-${('0'+day).slice(-2)}`;
        dateString = `%20until%3A${dateString}`;
        console.log('date string: ',dateString);
        url = `https://twitter.com/search?q=from%3A${name}${dateString}&src=typed_query&f=live`;
        let newData = await scrape(url, remainingTweets, name);
        let sizeBefore = data.size;
        data = data.union(newData);
        let sizeAfter = data.size;
        remainingTweets = number - data.size;
        if(sizeBefore == sizeAfter){
            remainingTweets += 200; //to avoid looping over the same tweets
        }
    }
    data = data.toArray();
    let numToDelete = data.length - number;
    for(let i=0;i<numToDelete;i++){
        data.pop();
    }
    fs.writeFileSync(filename, JSON.stringify([data, name]));
}

getTweets(numOfTweets, accName)