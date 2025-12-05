import express from "express"

const app = express()

app.get("/",(req,res)=>{
    res.send("Server is ready")
})

const port = process.env.PORT || 3000

app.listenerCount(port,()=>{
    console.log('Serve at http://localhost:${port}')
})