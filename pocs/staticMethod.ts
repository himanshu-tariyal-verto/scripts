class StaticClass {
    public static readonly Primary = 'Hellow';

    public static HelloWorld() {
        return "Hellow World"
    }
}

console.log(StaticClass.Primary)
console.log(StaticClass.HelloWorld())
console.log(StaticClass.HelloWorld.name)
