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

function downloadBody(){
    const data = document.querySelector('main');
    return data.outerHTML;
}

function extractItems(body, num){
    let items = [];
    const $ = cheerio.load(body);
    $('article[aria-haspopup="false"][role="article"]').each((i, el) => {
        if(items.length < num){
            let tweetHtml = $.html(el);
            if(tweetHtml.search(/role="blockquote"/) == -1 && tweetHtml.search(/<svg viewBox="0 0 0 24" aria-label/) == -1){
                let $$ = cheerio.load(tweetHtml);
                // let text = $$(`${tweetHtml}`).text();
                let text = $$('div[lang][dir="auto"]').text();
                console.log(text);
                console.log('------------')
                items.push(text);
            }
        }
    });
    return items;
}

async function infiniteScroll(page, num){
    let items = [];
    let body;
    try{
        let previousHeight;
        while (items.length < num) {
            body = await page.evaluate(downloadBody);
            items = await extractItems(body, num);
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`);
            await page.waitFor(1000);
        }
        return items;
    }
    catch(e){}
    
    // if($('body').has('.timeline').length){
    //     $('.timeline .tweet').each((i, el) => {
    //         if(counter < num){
    //             let tweetHtml = $.html(el);
    //             let test = tweetHtml.search(/<span class="context">[^]* retweeted<\/span>/);
    //             if(test === -1){
    //                 let $$ = cheerio.load(tweetHtml);
    //                 let tweetCore = $$('.dir-ltr');
    //                 let coreHtml = $$.html(tweetCore);
    //                 let tweetID = bigInt($$('.tweet-text').attr('data-id'));
    //                 let IDShifted = tweetID.shiftRight(22);
    //                 let offset = 1288834974657;
    //                 let tstamp = IDShifted.add(offset);
    //                 let date = new Date(parseInt(tstamp.toString()));
    //                 let text = $$(`${coreHtml}`).not('a').text();
    //                 text = text.replace(/\n/g, ' ');
    //                 text = text.replace(/\\/, '');
    //                 text = text.replace(/"/g, "'");
    //                 let tweetObj = {
    //                     text: text.trim(),
    //                     date: date.toString(),
    //                     id: tweetID.toString().trim()
    //                 }
    //                 const tweetMap = Map(tweetObj);
    //                 let sizeBefore = tweetArr.size;
    //                 tweetArr = tweetArr.add(tweetMap);
    //                 if(tweetArr.size > sizeBefore){
    //                     counter++;
    //                 }
    //                 console.log(`Tweets parsed: ${counter}/${num}`);
    //             }
    //         }
    //     });
    // }
}

function scrape(url, num){
    return new Promise(async (resolve, reject) => {
        try {
            const browser = await puppeteer.launch({headless: true});
            const page = await browser.newPage();
            page.setViewport({ width: 1280, height: 926 });
            await page.goto(url);
            await page.waitFor('main');
            await page.waitFor(3000);
            let data = await infiniteScroll(page, num);
            browser.close();
            resolve(data);
        } catch (error) {
            reject(error)
        }
    });
}

async function getTweets(number = 10, name = "CNN"){
    let url = `https://twitter.com/search?q=from%3A${name}&src=typed_query&f=live`;
    let data = [];
    data = await scrape(url, number);
    fs.writeFileSync(filename, JSON.stringify([data, name]));
}

getTweets(numOfTweets, accName)