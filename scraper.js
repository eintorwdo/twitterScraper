const cheerio = require('cheerio');
const fs = require('fs');
const bigInt = require("big-integer");
const { Map, OrderedSet } = require('immutable');
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);

let accName, numOfTweets, counter, append, filename;
let tweetArr = OrderedSet();
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

function extractItems(body, num, name){
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
    // console.log(items.size)
    return items;
}

async function infiniteScroll(page, num, name){
    let items = OrderedSet();
    let body;
    try{
        let previousHeight;
        while (items.size < num) {
            body = await page.evaluate(downloadBody);
            let itemsArr = await extractItems(body, num, name);
            items = items.union(itemsArr);
            console.log(items.size)
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`);
            await page.waitFor(1000);
        }
        return items;
    }
    catch(e){
        console.log(e);
    }
}

function scrape(url, num, name){
    return new Promise(async (resolve, reject) => {
        try {
            const browser = await puppeteer.launch({headless: true});
            const page = await browser.newPage();
            page.setViewport({ width: 1280, height: 926 });
            await page.goto(url);
            await page.waitFor('main');
            await page.waitFor(3000);
            let data = await infiniteScroll(page, num, name);
            browser.close();
            resolve(data);
        } catch (error) {
            reject(error)
        }
    });
}

async function getTweets(number = 10, name = "CNN"){
    let url = `https://twitter.com/search?q=from%3A${name}&src=typed_query&f=live`;
    let data;
    data = await scrape(url, number, name);
    fs.writeFileSync(filename, JSON.stringify([data, name]));
}

getTweets(numOfTweets, accName)