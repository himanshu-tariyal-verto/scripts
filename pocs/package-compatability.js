async function main() {
    const {Md5} = await import("ts-md5");
    const abc = Md5.hashAsciiStr("hellow");

    console.log(abc)
}

main()