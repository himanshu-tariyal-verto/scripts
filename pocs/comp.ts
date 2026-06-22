import { Md5 } from "ts-md5";


function main() {
    const abc = Md5.hashAsciiStr("hellow");
    const bac = Md5.hashAsciiStr("Yello");

    console.log(abc)
    console.log(bac)
}

main()