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
    let limit = false;
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
    // $('div[aria-haspopup="false"][role="button"][data-focusable="true"]').each((i, el) => {
    //     let buttonHtml = $.html(el);
    //     let path = /d="M12 2C6.486 2 2 6.486 2 12c0 .414.336.75.75.75s.75-.336.75-.75c0-4.687 3.813-8.5 8.5-8.5s8.5 3.813 8.5 8.5-3.813 8.5-8.5 8.5c-2.886 0-5.576-1.5-7.13-3.888l2.983.55c.402.08.798-.193.874-.6.076-.408-.194-.8-.6-.874l-4.663-.86c-.204-.04-.414.01-.58.132-.168.123-.276.31-.3.515l-.57 4.706c-.05.412.242.785.653.835.03.004.06.006.09.006.375 0 .698-.278.745-.66l.32-2.63C5.673 20.36 8.728 22 12 22c5.514 0 10-4.486 10-10S17.514 2 12 2z"/;
    //     if(buttonHtml.search(path) != -1){
    //         let buttonInner = $.html(el);
    //         let buttonText = $(buttonInner).text(); 
    //         console.log(buttonText, parseInt(buttonText.length));
    //         // if(buttonText.length > 0){
    //         //     console.log("LIMIT");
    //         //     limit = true;
    //         // }
    //     }
    // });
    return items;
}

async function infiniteScroll(page, num, name){
    let items = OrderedSet();
    let body;
    let limit = false;
    try{
        let previousHeight;
        while (items.size < num) {
            body = await page.evaluate(downloadBody);
            let itemsArr = await extractItems(body, num, name);
            items = items.union(itemsArr);
            console.log(items.size)
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`, {timeout: 3000});
            await page.waitFor(1000);
        }
        return [items, limit];
    }
    catch(e){
        if(e.name == 'TimeoutError'){
            limit = true;
            return [items, limit];
        }
    }
}

function scrape(url, num, name){
    return new Promise(async (resolve, reject) => {
        try {
            const browser = await puppeteer.launch({headless: false});
            const page = await browser.newPage();
            page.setViewport({ width: 1280, height: 926 });
            await page.goto(url);
            await page.waitFor('main');
            await page.waitFor(3000);
            let data = await infiniteScroll(page, num, name);
            // browser.close();
            resolve(data);
        } catch (error) {
            reject(error)
        }
    });
}

async function getTweets(number = 10, name = "CNN"){
    let date = new Date();
    // let dateString = `${date.getFullYear()}-${('0'+(date.getMonth()+1)).slice(-2)}-${('0'+date.getDate()).slice(-2)}`;
    let url = `https://twitter.com/search?q=from%3A${name}&src=typed_query&f=live`;
    let data;
    data = await scrape(url, number, name);
    fs.writeFileSync(filename, JSON.stringify([data[0], name]));
}

getTweets(numOfTweets, accName)