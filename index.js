const { MongoClient } = require(`mongodb`);

const drivers = [
    {
        name: "John Doey",
        vehicleType: "Sedan",
        isAvailable: true,  
        rating: 4.8
    },
    {
        name: "Alice Smith",
        vehicleType: "SUV",
        isAvailable: false,  
        rating: 4.5
    }
];

drivers.forEach(driver => console.log(driver.name));

drivers.push({
    name: "Brandon",
    vehicleType: "Vellfire",
    isAvailable: true,  
    rating: 4.9
});

console.log(drivers);

async function main() {
    const uri = "mongodb://localhost:27017"; 
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        const db = client.db("testDB");
        const collection = db.collection("drivers");

        const driversCollection = db.collection("drivers");

      //  for (const driver of drivers) {
     //       const result = await driversCollection.insertOne(driver);
      //      console.log(`New driver created: ${driver.name}, ID: ${result.insertedId}`);
      //  }

      //  const updateResult = await db.collection('drivers').updateMany(
      //     { name: "John Doey" },
      //     [ { 
      //          $set: { 
      //                  rating: 
      //                          { 
      //                              $toDouble: { $round: [{ $add: ["$rating", 0.1] }, 1] } 
       //                         }
       //               } 
        //      }
       //    ]
      //  );
    
     //  console.log(`Driver updated: Matched ${updateResult.matchedCount}, Modified ${updateResult.modifiedCount}`);

       const deleteResult = await db.collection(`drivers`).deleteMany({isAvailable: false});
       console.log(`Deleted Count: ${deleteResult.deletedCount}`);

     // const availableDrivers = await driversCollection.find({
     //     isAvailable: true,
     //     rating: {$gte: 4.5}
     // }).toArray();
     // console.log("Available drivers:", availableDrivers);

    } finally {
        await client.close();
    }
}

main();